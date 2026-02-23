import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import {
  getDb, getUserByUsername, getCustomer, getAllCustomers, createCustomer, updateCustomer,
  getTemplate, getAllTemplates, createTemplate, updateTemplate, deleteTemplate,
  createSandbox, updateSandbox, getSandbox, getSandboxesByCustomer, getAllSandboxes,
  getRunningSandboxes, getAuditLog, getSecurityEvents, getMetricsCache,
  audit, secEvent, adminExists, createAdmin,
} from './db.js';

import {
  initializeInfrastructure, generateSSHKeyPair, importKeyToEC2, launchInstance,
  waitForRunning, stopInstance, startInstance, terminateInstance,
  describeInstance, getInfraStatus, resolveInstanceType,
} from './aws.js';

import { startMetricsPolling } from './metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const REGION = process.env.AWS_DEFAULT_REGION || 'us-east-1';

app.use(express.json());

// ── Serve static frontend in production ──
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// ── Auth Middleware ──
function authMiddleware(requiredRole) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    try {
      const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
      req.user = decoded;
      if (requiredRole && decoded.role !== requiredRole) return res.status(403).json({ error: 'Forbidden' });
      next();
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
  };
}

const authAny = authMiddleware(null);
const authAdmin = authMiddleware('admin');
const authCustomer = authMiddleware('customer');

// Instance pricing
const INSTANCE_PRICES = {
  'm8i.large': 0.1008, 'm8i.xlarge': 0.2016, 'm8i.2xlarge': 0.4032, 'm8i.4xlarge': 0.8064,
  'c8i.large': 0.0892, 'c8i.xlarge': 0.1785, 'c8i.2xlarge': 0.357,
  'r8i.large': 0.1323, 'r8i.xlarge': 0.2646, 'r8i.2xlarge': 0.5292,
  'm8i-flex.large': 0.09408, 'm8i-flex.xlarge': 0.18816,
  'm7i.large': 0.1008, 'm7i.xlarge': 0.2016, 'm7i.2xlarge': 0.4032, 'm7i.4xlarge': 0.8064,
  'c7i.large': 0.0892, 'c7i.xlarge': 0.1785, 'c7i.2xlarge': 0.357,
  'r7i.large': 0.1323, 'r7i.xlarge': 0.2646, 'r7i.2xlarge': 0.5292,
  'm7i-flex.large': 0.09408, 'm7i-flex.xlarge': 0.18816,
};

// ══════════════════════════════════════════
//  FIRST-RUN SETUP (no auth required)
// ══════════════════════════════════════════

app.get('/api/setup/status', (req, res) => {
  res.json({ needsSetup: !adminExists() });
});

app.post('/api/setup/admin', (req, res) => {
  if (adminExists()) return res.status(400).json({ error: 'Admin already configured' });

  const { username, password, displayName } = req.body;
  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (password.trim() !== password || password.includes(' ')) {
    return res.status(400).json({ error: 'Password cannot contain spaces' });
  }

  try {
    createAdmin(username.trim(), password, (displayName || 'Platform Admin').trim());
    res.json({ success: true, message: `Admin '${username.trim()}' created successfully` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
//  AUTH ROUTES
// ══════════════════════════════════════════

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  const user = getUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, displayName: user.display_name, customerId: user.customer_id },
    JWT_SECRET, { expiresIn: '24h' }
  );

  audit(username, 'auth.login', null, `${user.role} login`);
  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, displayName: user.display_name, customerId: user.customer_id },
  });
});

// ══════════════════════════════════════════
//  INFRASTRUCTURE SETUP
// ══════════════════════════════════════════

app.get('/api/infra/status', authAdmin, (req, res) => {
  res.json(getInfraStatus());
});

app.post('/api/infra/init', authAdmin, async (req, res) => {
  try {
    const result = await initializeInfrastructure();
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('Infra init error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
//  ADMIN ROUTES
// ══════════════════════════════════════════

app.get('/api/admin/dashboard', authAdmin, (req, res) => {
  const sandboxes = getAllSandboxes();
  const customers = getAllCustomers();
  const running = sandboxes.filter(s => s.status === 'running');

  let totalVcpu = 0, totalMem = 0;
  const SPECS = {
    'm8i.large':2,'m7i.large':2,'m8i.xlarge':4,'m7i.xlarge':4,'m8i.2xlarge':8,'m7i.2xlarge':8,
    'm8i.4xlarge':16,'m7i.4xlarge':16,'c8i.large':2,'c7i.large':2,'c8i.xlarge':4,'c7i.xlarge':4,
    'c8i.2xlarge':8,'c7i.2xlarge':8,'r8i.large':2,'r7i.large':2,'r8i.xlarge':4,'r7i.xlarge':4,
    'r8i.2xlarge':8,'r7i.2xlarge':8,'m8i-flex.large':2,'m7i-flex.large':2,'m8i-flex.xlarge':4,'m7i-flex.xlarge':4,
  };
  const MEMS = {
    'm8i.large':8,'m7i.large':8,'m8i.xlarge':16,'m7i.xlarge':16,'m8i.2xlarge':32,'m7i.2xlarge':32,
    'm8i.4xlarge':64,'m7i.4xlarge':64,'c8i.large':4,'c7i.large':4,'c8i.xlarge':8,'c7i.xlarge':8,
    'c8i.2xlarge':16,'c7i.2xlarge':16,'r8i.large':16,'r7i.large':16,'r8i.xlarge':32,'r7i.xlarge':32,
    'r8i.2xlarge':64,'r7i.2xlarge':64,'m8i-flex.large':8,'m7i-flex.large':8,'m8i-flex.xlarge':16,'m7i-flex.xlarge':16,
  };
  for (const s of running) {
    totalVcpu += SPECS[s.instance_type] || 0;
    totalMem += MEMS[s.instance_type] || 0;
  }

  // Avg metrics from cache
  let avgCpu = 0, avgMem = 0;
  if (running.length > 0) {
    for (const s of running) {
      const mc = getMetricsCache(s.id);
      if (mc) { avgCpu += mc.cpu; avgMem += mc.memory; }
    }
    avgCpu /= running.length;
    avgMem /= running.length;
  }

  const totalCost = sandboxes.reduce((a, s) => a + s.cost_accrued, 0);
  const totalCredits = customers.reduce((a, c) => a + c.credits, 0);

  res.json({
    running: running.length,
    stopped: sandboxes.filter(s => s.status === 'stopped').length,
    terminated: sandboxes.filter(s => s.status === 'terminated').length,
    total: sandboxes.length,
    activeCustomers: customers.filter(c => c.status === 'active').length,
    totalRevenue: totalCost,
    totalCredits,
    totalVcpu,
    totalMem,
    avgCpu: Math.round(avgCpu * 100) / 100,
    avgMem: Math.round(avgMem * 100) / 100,
    customers: customers.map(c => {
      const cs = sandboxes.filter(s => s.customer_id === c.id);
      return { ...c, sandboxCount: cs.filter(s => s.status !== 'terminated').length, currentSpend: cs.reduce((a, s) => a + s.cost_accrued, 0) };
    }),
    recentAudit: getAuditLog(10),
  });
});

// Customers
app.get('/api/admin/customers', authAdmin, (req, res) => {
  const customers = getAllCustomers();
  const sandboxes = getAllSandboxes();
  res.json(customers.map(c => {
    const cs = sandboxes.filter(s => s.customer_id === c.id);
    return { ...c, sandboxCount: cs.filter(s => s.status !== 'terminated').length, currentSpend: cs.reduce((a, s) => a + s.cost_accrued, 0) };
  }));
});

app.post('/api/admin/customers', authAdmin, (req, res) => {
  const { name, email, company, credits } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  const id = 'cust-' + Date.now().toString(36);
  createCustomer(id, name, email, company || '', credits || 500);

  // Create a user login for them — generate a strong random password
  const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9.]/g, '');
  const pwChars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
  const pwBytes = crypto.randomBytes(14);
  const password = Array.from(pwBytes).map(b => pwChars[b % pwChars.length]).join('');
  const bcryptPw = bcrypt.hashSync(password, 10);
  try {
    getDb().prepare('INSERT INTO users (username, password_hash, role, display_name, customer_id) VALUES (?,?,?,?,?)').run(username, bcryptPw, 'customer', name, id);
  } catch {}

  audit(req.user.username, 'customer.create', id, `Created ${name}, allocated $${credits || 500}`);
  res.json({ id, username, password, message: `Customer created. Login: ${username} / ${password}` });
});

app.put('/api/admin/customers/:id', authAdmin, (req, res) => {
  const cust = getCustomer(req.params.id);
  if (!cust) return res.status(404).json({ error: 'Customer not found' });

  const updates = req.body;
  if (updates.topup) {
    updates.credits = cust.credits + parseFloat(updates.topup);
    updates.total_allocated = cust.total_allocated + parseFloat(updates.topup);
    audit(req.user.username, 'credit.topup', req.params.id, `Added $${updates.topup} (new balance: $${updates.credits.toFixed(2)})`);
    delete updates.topup;
  }
  if (updates.status) {
    audit(req.user.username, 'customer.update', req.params.id, `Status → ${updates.status}`);
  }

  updateCustomer(req.params.id, updates);
  res.json({ success: true, customer: getCustomer(req.params.id) });
});

// Sandboxes (admin view — all)
app.get('/api/admin/sandboxes', authAdmin, (req, res) => {
  const sandboxes = getAllSandboxes();
  const customers = getAllCustomers();
  const templates = getAllTemplates();
  res.json(sandboxes.map(s => ({
    ...s,
    customerName: customers.find(c => c.id === s.customer_id)?.name || s.customer_id,
    templateName: templates.find(t => t.id === s.template_id)?.name || s.template_id,
    metrics: getMetricsCache(s.id) || { cpu: 0, memory: 0, net_in: 0, net_out: 0, disk: 0, iops: 0, history: '[]' },
    priceHr: INSTANCE_PRICES[s.instance_type] || 0,
  })));
});

// Templates
app.get('/api/admin/templates', authAdmin, (req, res) => {
  res.json(getAllTemplates().map(t => ({ ...t, tags: JSON.parse(t.tags || '[]'), security_groups: JSON.parse(t.security_groups || '[]'), enabled: !!t.enabled })));
});

app.post('/api/admin/templates', authAdmin, (req, res) => {
  const t = req.body;
  if (!t.id || !t.name) return res.status(400).json({ error: 'ID and name required' });
  t.tags = typeof t.tags === 'string' ? t.tags : JSON.stringify(t.tags || []);
  t.security_groups = typeof t.security_groups === 'string' ? t.security_groups : JSON.stringify(t.security_groups || []);
  createTemplate(t);
  audit(req.user.username, 'template.create', t.id, `Created template: ${t.name}`);
  res.json({ success: true });
});

app.put('/api/admin/templates/:id', authAdmin, (req, res) => {
  const t = req.body;
  t.tags = typeof t.tags === 'string' ? t.tags : JSON.stringify(t.tags || []);
  t.security_groups = typeof t.security_groups === 'string' ? t.security_groups : JSON.stringify(t.security_groups || []);
  updateTemplate(req.params.id, t);
  audit(req.user.username, 'template.update', req.params.id, `Updated template: ${t.name}`);
  res.json({ success: true });
});

app.delete('/api/admin/templates/:id', authAdmin, (req, res) => {
  deleteTemplate(req.params.id);
  audit(req.user.username, 'template.delete', req.params.id, 'Template deleted');
  res.json({ success: true });
});

// Security & Audit
app.get('/api/admin/security', authAdmin, (req, res) => {
  res.json(getSecurityEvents(100));
});

app.get('/api/admin/audit', authAdmin, (req, res) => {
  res.json(getAuditLog(200));
});

// Admin can act on any sandbox
app.post('/api/admin/sandboxes/:id/:action', authAdmin, async (req, res) => {
  return handleSandboxAction(req, res, req.params.id, req.params.action, req.user.username);
});

// ══════════════════════════════════════════
//  CUSTOMER ROUTES
// ══════════════════════════════════════════

app.get('/api/customer/dashboard', authCustomer, (req, res) => {
  const customer = getCustomer(req.user.customerId);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const sandboxes = getSandboxesByCustomer(req.user.customerId);
  const running = sandboxes.filter(s => s.status === 'running');
  const burnRate = running.reduce((a, s) => a + (INSTANCE_PRICES[s.instance_type] || 0), 0);
  const totalCost = sandboxes.reduce((a, s) => a + s.cost_accrued, 0);

  res.json({
    customer,
    sandboxes: sandboxes.filter(s => s.status !== 'terminated').map(s => ({
      ...s,
      metrics: getMetricsCache(s.id) || { cpu: 0, memory: 0, net_in: 0, net_out: 0, disk: 0, iops: 0, history: '[]' },
      priceHr: INSTANCE_PRICES[s.instance_type] || 0,
    })),
    burnRate,
    totalCost,
    running: running.length,
  });
});

app.get('/api/customer/credits', authCustomer, (req, res) => {
  const customer = getCustomer(req.user.customerId);
  const sandboxes = getSandboxesByCustomer(req.user.customerId);
  const running = sandboxes.filter(s => s.status === 'running');
  res.json({
    customer,
    activeSandboxes: running.map(s => ({
      id: s.id, instance_type: s.instance_type, cost_accrued: s.cost_accrued,
      priceHr: INSTANCE_PRICES[s.instance_type] || 0,
    })),
    burnRate: running.reduce((a, s) => a + (INSTANCE_PRICES[s.instance_type] || 0), 0),
  });
});

app.get('/api/customer/sandboxes', authCustomer, (req, res) => {
  const sandboxes = getSandboxesByCustomer(req.user.customerId);
  const templates = getAllTemplates();
  res.json(sandboxes.filter(s => s.status !== 'terminated').map(s => ({
    ...s,
    templateName: templates.find(t => t.id === s.template_id)?.name || s.template_id,
    metrics: getMetricsCache(s.id) || { cpu: 0, memory: 0, net_in: 0, net_out: 0, disk: 0, iops: 0, history: '[]' },
    priceHr: INSTANCE_PRICES[s.instance_type] || 0,
  })));
});

app.get('/api/customer/sandboxes/:id', authCustomer, (req, res) => {
  const sandbox = getSandbox(req.params.id);
  if (!sandbox || sandbox.customer_id !== req.user.customerId) return res.status(404).json({ error: 'Not found' });
  const metrics = getMetricsCache(sandbox.id) || { cpu: 0, memory: 0, net_in: 0, net_out: 0, disk: 0, iops: 0, history: '[]' };
  res.json({ ...sandbox, metrics, priceHr: INSTANCE_PRICES[sandbox.instance_type] || 0 });
});

app.get('/api/customer/templates', authCustomer, (req, res) => {
  const cust = getCustomer(req.user.customerId);
  const templates = getAllTemplates().filter(t => t.enabled && (t.tier === 'all' || t.tier === cust?.tier));
  res.json(templates.map(t => ({ ...t, tags: JSON.parse(t.tags || '[]'), enabled: !!t.enabled })));
});

// ── Deploy Sandbox ──
app.post('/api/customer/sandboxes', authCustomer, async (req, res) => {
  const { templateId, instanceType } = req.body;
  const customer = getCustomer(req.user.customerId);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  if (customer.status !== 'active') return res.status(403).json({ error: 'Account suspended' });

  const template = getTemplate(templateId);
  if (!template) return res.status(400).json({ error: 'Template not found' });

  const priceHr = INSTANCE_PRICES[instanceType] || 0.20;
  if (customer.credits < priceHr) return res.status(400).json({ error: 'Insufficient credits' });

  // Check infra
  const infra = getInfraStatus();
  if (!infra.initialized) return res.status(400).json({ error: 'Platform infrastructure not initialized. Contact admin.' });

  const sandboxId = 'sbx-' + crypto.randomUUID().substring(0, 8);

  // Generate SSH key pair
  const keys = generateSSHKeyPair(sandboxId);

  // Create sandbox record in deploying state
  const secScore = template.security_profile === 'strict' ? 96 : template.security_profile === 'enhanced' ? 92 : 88;
  createSandbox({
    id: sandboxId, customer_id: customer.id, template_id: templateId, instance_type: instanceType,
    instance_id: null, public_ip: null, public_dns: null, status: 'deploying',
    ssh_user: template.ssh_user, ssh_port: template.ssh_port,
    key_fingerprint: keys.fingerprint, security_score: secScore,
    vpc_id: infra.vpc_id, subnet_id: infra.subnet_id, sg_id: infra[`sg_${template.security_profile}`] || infra.sg_standard,
  });

  audit(req.user.username, 'sandbox.deploy', sandboxId, `Deploying ${template.name} on ${instanceType}`);

  // Return immediately with sandbox ID and private key — launch async
  res.json({
    sandboxId,
    status: 'deploying',
    privateKey: keys.privateKeyPem,
    fingerprint: keys.fingerprint,
    sshUser: template.ssh_user,
    sshPort: template.ssh_port,
  });

  // Async: import key, launch instance, wait for running
  (async () => {
    try {
      const keyName = await importKeyToEC2(sandboxId, keys.opensshPubKey);
      const launch = await launchInstance({
        sandboxId, instanceType, template: {
          ...template, tags: JSON.parse(template.tags || '[]'), security_groups: JSON.parse(template.security_groups || '[]'),
        }, keyName,
      });

      updateSandbox(sandboxId, {
        instance_id: launch.instanceId,
        status: 'deploying',
        vpc_id: launch.vpcId,
        subnet_id: launch.subnetId,
        sg_id: launch.sgId,
      });

      const running = await waitForRunning(launch.instanceId);
      updateSandbox(sandboxId, {
        status: 'running',
        public_ip: running.publicIp,
        public_dns: running.publicDns,
      });

      audit('system', 'sandbox.running', sandboxId, `Instance ${launch.instanceId} running at ${running.publicIp}`);
      secEvent(sandboxId, 'deploy', 'info', `Sandbox deployed: ${launch.instanceId} (${launch.actualType})`);

    } catch (e) {
      console.error(`[Deploy] Failed for ${sandboxId}:`, e.message);
      updateSandbox(sandboxId, { status: 'failed' });
      audit('system', 'sandbox.failed', sandboxId, `Deploy failed: ${e.message}`);
      // Clean up orphaned AWS resources
      try { await terminateInstance(getSandbox(sandboxId)?.instance_id, sandboxId); } catch {}
    }
  })();
});

// Customer sandbox actions
app.post('/api/customer/sandboxes/:id/:action', authCustomer, async (req, res) => {
  const sandbox = getSandbox(req.params.id);
  if (!sandbox || sandbox.customer_id !== req.user.customerId) return res.status(404).json({ error: 'Not found' });
  return handleSandboxAction(req, res, req.params.id, req.params.action, req.user.username);
});

// Mark key downloaded
app.post('/api/customer/sandboxes/:id/key-downloaded', authCustomer, (req, res) => {
  const sandbox = getSandbox(req.params.id);
  if (!sandbox || sandbox.customer_id !== req.user.customerId) return res.status(404).json({ error: 'Not found' });
  updateSandbox(req.params.id, { key_downloaded: 1 });
  audit(req.user.username, 'key.download', req.params.id, 'SSH private key downloaded');
  res.json({ success: true });
});

// ── Metrics ──
app.get('/api/metrics/:sandboxId', authAny, (req, res) => {
  const sandbox = getSandbox(req.params.sandboxId);
  if (!sandbox) return res.status(404).json({ error: 'Sandbox not found' });
  // Access check: admin can see all, customer only their own
  if (req.user.role === 'customer' && sandbox.customer_id !== req.user.customerId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const metrics = getMetricsCache(req.params.sandboxId);
  res.json(metrics || { cpu: 0, memory: 0, net_in: 0, net_out: 0, disk: 0, iops: 0, history: '[]' });
});

// ── Instance prices (for frontend) ──
app.get('/api/instance-prices', authAny, (req, res) => {
  res.json(INSTANCE_PRICES);
});

// ══════════════════════════════════════════
//  SHARED ACTION HANDLER
// ══════════════════════════════════════════

async function handleSandboxAction(req, res, sandboxId, action, actor) {
  const sandbox = getSandbox(sandboxId);
  if (!sandbox) return res.status(404).json({ error: 'Sandbox not found' });

  try {
    switch (action) {
      case 'stop':
        if (sandbox.status !== 'running') return res.status(400).json({ error: 'Sandbox not running' });
        if (sandbox.instance_id) await stopInstance(sandbox.instance_id);
        updateSandbox(sandboxId, { status: 'stopped', stopped_at: new Date().toISOString() });
        audit(actor, 'sandbox.stop', sandboxId, 'Sandbox stopped');
        break;

      case 'start':
        if (sandbox.status !== 'stopped') return res.status(400).json({ error: 'Sandbox not stopped' });
        // Check credits for customer
        if (req.user.role === 'customer') {
          const cust = getCustomer(req.user.customerId);
          if (cust.credits <= 0) return res.status(400).json({ error: 'Insufficient credits' });
        }
        if (sandbox.instance_id) await startInstance(sandbox.instance_id);
        updateSandbox(sandboxId, { status: 'running', stopped_at: null });
        // Poll for public IP in background (EC2 takes 15-60s to assign)
        if (sandbox.instance_id) {
          (async () => {
            for (let attempt = 0; attempt < 12; attempt++) {
              await new Promise(r => setTimeout(r, 10000));
              try {
                const info = await describeInstance(sandbox.instance_id);
                if (info && info.publicIp) {
                  updateSandbox(sandboxId, { public_ip: info.publicIp, public_dns: info.publicDns });
                  console.log(`[Start] IP assigned for ${sandboxId}: ${info.publicIp}`);
                  break;
                }
              } catch {}
            }
          })();
        }
        audit(actor, 'sandbox.start', sandboxId, 'Sandbox started');
        break;

      case 'terminate':
        if (sandbox.instance_id) await terminateInstance(sandbox.instance_id, sandboxId);
        updateSandbox(sandboxId, { status: 'terminated', terminated_at: new Date().toISOString() });
        audit(actor, 'sandbox.terminate', sandboxId, 'Sandbox terminated');
        secEvent(sandboxId, 'terminate', 'info', `Sandbox terminated by ${actor}`);
        break;

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }

    res.json({ success: true, sandbox: getSandbox(sandboxId) });
  } catch (e) {
    console.error(`[Action] ${action} failed for ${sandboxId}:`, e.message);
    res.status(500).json({ error: e.message });
  }
}

// ── SPA fallback ──
if (fs.existsSync(distPath)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ── Start ──
const server = app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  Sandbox Console API running on port ${PORT}      ║`);
  console.log(`║  Region: ${REGION}                          ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  // Initialize DB (creates tables + seeds templates)
  getDb();

  if (!adminExists()) {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  FIRST RUN: Open the app to create your     ║');
    console.log('║  admin account. No default password exists.  ║');
    console.log('╚══════════════════════════════════════════════╝\n');
  } else {
    console.log('Admin account configured. Ready.\n');
  }

  // Start metrics polling (60 second interval)
  startMetricsPolling(60000);
});
