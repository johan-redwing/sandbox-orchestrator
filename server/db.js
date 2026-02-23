import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'sandbox-console.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate();
  }
  return db;
}

function migrate() {
  const d = getDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','customer')),
      display_name TEXT NOT NULL,
      customer_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT DEFAULT '',
      credits REAL DEFAULT 0,
      total_allocated REAL DEFAULT 0,
      total_spent REAL DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','suspended')),
      tier TEXT DEFAULT 'all',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT DEFAULT 'Server',
      color TEXT DEFAULT '#00d4aa',
      description TEXT DEFAULT '',
      recommended TEXT DEFAULT 'm8i.xlarge',
      tags TEXT DEFAULT '[]',
      security_profile TEXT DEFAULT 'standard',
      max_ttl INTEGER DEFAULT 72,
      ssh_user TEXT DEFAULT 'dev',
      ssh_port INTEGER DEFAULT 22,
      enabled INTEGER DEFAULT 1,
      tier TEXT DEFAULT 'all',
      ami TEXT DEFAULT '',
      volume_size INTEGER DEFAULT 100,
      volume_type TEXT DEFAULT 'gp3',
      iops INTEGER DEFAULT 3000,
      throughput INTEGER DEFAULT 125,
      security_groups TEXT DEFAULT '[]',
      user_data TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sandboxes (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      template_id TEXT NOT NULL,
      instance_type TEXT NOT NULL,
      instance_id TEXT,
      public_ip TEXT,
      public_dns TEXT,
      status TEXT DEFAULT 'deploying' CHECK(status IN ('deploying','running','stopping','stopped','terminating','terminated','failed')),
      ssh_user TEXT NOT NULL,
      ssh_port INTEGER NOT NULL,
      key_fingerprint TEXT,
      key_downloaded INTEGER DEFAULT 0,
      security_score INTEGER DEFAULT 88,
      cost_accrued REAL DEFAULT 0,
      vpc_id TEXT,
      subnet_id TEXT,
      sg_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      stopped_at TEXT,
      terminated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      detail TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sandbox_id TEXT,
      type TEXT NOT NULL,
      severity TEXT DEFAULT 'info',
      detail TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS infra_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS metrics_cache (
      sandbox_id TEXT PRIMARY KEY,
      cpu REAL DEFAULT 0,
      memory REAL DEFAULT 0,
      net_in REAL DEFAULT 0,
      net_out REAL DEFAULT 0,
      disk REAL DEFAULT 0,
      iops REAL DEFAULT 0,
      history TEXT DEFAULT '[]',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sandboxes_customer ON sandboxes(customer_id);
    CREATE INDEX IF NOT EXISTS idx_sandboxes_status ON sandboxes(status);
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_security_sandbox ON security_events(sandbox_id);
  `);

  // Seed default data if empty
  const userCount = d.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) seedDefaults(d);
}

function seedDefaults(d) {
  const insert_template = d.prepare(
    'INSERT INTO templates (id, name, icon, color, description, recommended, tags, security_profile, max_ttl, ssh_user, ssh_port, enabled, tier, ami, volume_size, volume_type, iops, throughput, security_groups, user_data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  );

  const txn = d.transaction(() => {
    const devUserData = `#!/bin/bash
apt-get update -y || true
apt-get install -y docker.io git nodejs npm python3 python3-pip postgresql postgresql-client redis-server || true
systemctl enable docker && systemctl start docker || true
# CloudWatch agent
wget -q https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb && dpkg -i amazon-cloudwatch-agent.deb || true
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'CWEOF'
{"metrics":{"namespace":"SandboxConsole","metrics_collected":{"mem":{"measurement":["mem_used_percent"]},"disk":{"measurement":["disk_used_percent"],"resources":["/"]}}},"logs":{}}
CWEOF
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s || true
# SSH hardening
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
echo "ClientAliveInterval 300" >> /etc/ssh/sshd_config
echo "ClientAliveCountMax 3" >> /etc/ssh/sshd_config
systemctl restart sshd || systemctl restart ssh || true`;

    const analyticsUserData = `#!/bin/bash
apt-get update -y || true
apt-get install -y python3 python3-pip redis-server openjdk-17-jre-headless || true
pip3 install pandas jupyter pyspark --break-system-packages || true
# SSH hardening - custom port
sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config
sed -i 's/Port 22$/Port 2222/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
echo "PermitRootLogin no" >> /etc/ssh/sshd_config
echo "ClientAliveInterval 300" >> /etc/ssh/sshd_config
echo "ClientAliveCountMax 3" >> /etc/ssh/sshd_config
systemctl restart sshd || systemctl restart ssh || true
# CloudWatch agent
wget -q https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb && dpkg -i amazon-cloudwatch-agent.deb || true
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'CWEOF'
{"metrics":{"namespace":"SandboxConsole","metrics_collected":{"mem":{"measurement":["mem_used_percent"]},"disk":{"measurement":["disk_used_percent"],"resources":["/"]}}},"logs":{}}
CWEOF
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s || true`;

    const mlUserData = `#!/bin/bash
apt-get update -y || true
apt-get install -y python3 python3-pip || true
pip3 install openvino onnxruntime torch --break-system-packages || true
# SSH hardening - custom port, strict
sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config
sed -i 's/Port 22$/Port 2222/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
echo "PermitRootLogin no" >> /etc/ssh/sshd_config
echo "MaxAuthTries 3" >> /etc/ssh/sshd_config
echo "ClientAliveInterval 300" >> /etc/ssh/sshd_config
echo "ClientAliveCountMax 3" >> /etc/ssh/sshd_config
systemctl restart sshd || systemctl restart ssh || true
# CloudWatch agent
wget -q https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb && dpkg -i amazon-cloudwatch-agent.deb || true
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'CWEOF'
{"metrics":{"namespace":"SandboxConsole","metrics_collected":{"mem":{"measurement":["mem_used_percent"]},"disk":{"measurement":["disk_used_percent"],"resources":["/"]}}},"logs":{}}
CWEOF
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s || true`;

    insert_template.run('dev-test', 'Dev / Test Environment', 'Terminal', '#00d4aa',
      'Full-stack development sandbox with Docker, Git, Node.js, Python, and PostgreSQL.',
      'm8i.xlarge', '["Docker","Git","Node.js","Python","PostgreSQL"]', 'standard', 72, 'ubuntu', 22,
      1, 'all', '', 100, 'gp3', 3000, 125, '[]', devUserData);

    insert_template.run('analytics', 'Data Analytics Pipeline', 'Database', '#6c8cff',
      'High-memory analytics sandbox with Spark, Pandas, Jupyter, and Redis. Intel AMX accelerated.',
      'r8i.2xlarge', '["Spark","Pandas","Jupyter","Redis","AMX"]', 'enhanced', 48, 'ubuntu', 2222,
      1, 'all', '', 250, 'gp3', 6000, 250, '[]', analyticsUserData);

    insert_template.run('ai-ml', 'AI / ML Inference Lab', 'Brain', '#ff6c9d',
      'Compute-optimized inference sandbox with OpenVINO, ONNX, PyTorch. AVX-512 & AMX enabled.',
      'c8i.2xlarge', '["OpenVINO","ONNX","PyTorch","AVX-512","AMX"]', 'strict', 24, 'ubuntu', 2222,
      1, 'all', '', 200, 'gp3', 6000, 250, '[]', mlUserData);

    // Initial audit entry
    d.prepare('INSERT INTO audit_log (actor, action, target, detail) VALUES (?,?,?,?)').run(
      'system', 'system.init', null, 'Database initialized with default templates'
    );
  });
  txn();
}

// ── Query Helpers ──

export function audit(actor, action, target, detail) {
  getDb().prepare('INSERT INTO audit_log (actor, action, target, detail) VALUES (?,?,?,?)').run(actor, action, target, detail);
}

export function secEvent(sandboxId, type, severity, detail) {
  getDb().prepare('INSERT INTO security_events (sandbox_id, type, severity, detail) VALUES (?,?,?,?)').run(sandboxId, type, severity, detail);
}

export function getInfra(key) {
  const row = getDb().prepare('SELECT value FROM infra_state WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setInfra(key, value) {
  getDb().prepare(`INSERT OR REPLACE INTO infra_state (key, value, updated_at) VALUES (?, ?, datetime('now'))`).run(key, value);
}

export function getUserByUsername(username) {
  return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function getCustomer(id) {
  return getDb().prepare('SELECT * FROM customers WHERE id = ?').get(id);
}

export function getAllCustomers() {
  return getDb().prepare('SELECT * FROM customers ORDER BY created_at DESC').all();
}

export function createCustomer(id, name, email, company, credits) {
  getDb().prepare(
    'INSERT INTO customers (id, name, email, company, credits, total_allocated, total_spent, status, tier) VALUES (?,?,?,?,?,?,0,?,?)'
  ).run(id, name, email, company, credits, credits, 'active', 'all');
}

export function updateCustomer(id, fields) {
  const allowed = ['name','email','company','credits','total_allocated','total_spent','status','tier'];
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return;
  vals.push(id);
  getDb().prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function getTemplate(id) {
  return getDb().prepare('SELECT * FROM templates WHERE id = ?').get(id);
}

export function getAllTemplates() {
  return getDb().prepare('SELECT * FROM templates ORDER BY created_at ASC').all();
}

export function createTemplate(t) {
  getDb().prepare(
    `INSERT INTO templates (id, name, icon, color, description, recommended, tags, security_profile, max_ttl, ssh_user, ssh_port, enabled, tier, ami, volume_size, volume_type, iops, throughput, security_groups, user_data)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(t.id, t.name, t.icon, t.color, t.description, t.recommended, t.tags, t.security_profile,
    t.max_ttl, t.ssh_user, t.ssh_port, t.enabled ? 1 : 0, t.tier, t.ami, t.volume_size,
    t.volume_type, t.iops, t.throughput, t.security_groups, t.user_data);
}

export function updateTemplate(id, t) {
  getDb().prepare(
    `UPDATE templates SET name=?, icon=?, color=?, description=?, recommended=?, tags=?, security_profile=?,
     max_ttl=?, ssh_user=?, ssh_port=?, enabled=?, tier=?, ami=?, volume_size=?, volume_type=?,
     iops=?, throughput=?, security_groups=?, user_data=? WHERE id=?`
  ).run(t.name, t.icon, t.color, t.description, t.recommended, t.tags, t.security_profile,
    t.max_ttl, t.ssh_user, t.ssh_port, t.enabled ? 1 : 0, t.tier, t.ami, t.volume_size,
    t.volume_type, t.iops, t.throughput, t.security_groups, t.user_data, id);
}

export function deleteTemplate(id) {
  getDb().prepare('DELETE FROM templates WHERE id = ?').run(id);
}

export function createSandbox(s) {
  getDb().prepare(
    `INSERT INTO sandboxes (id, customer_id, template_id, instance_type, instance_id, public_ip, public_dns, status, ssh_user, ssh_port, key_fingerprint, security_score, vpc_id, subnet_id, sg_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(s.id, s.customer_id, s.template_id, s.instance_type, s.instance_id, s.public_ip, s.public_dns,
    s.status, s.ssh_user, s.ssh_port, s.key_fingerprint, s.security_score, s.vpc_id, s.subnet_id, s.sg_id);
}

export function updateSandbox(id, fields) {
  const allowed = ['instance_id','public_ip','public_dns','status','key_downloaded','cost_accrued','stopped_at','terminated_at','security_score','vpc_id','subnet_id','sg_id'];
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return;
  vals.push(id);
  getDb().prepare(`UPDATE sandboxes SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function getSandbox(id) {
  return getDb().prepare('SELECT * FROM sandboxes WHERE id = ?').get(id);
}

export function getSandboxesByCustomer(customerId) {
  return getDb().prepare('SELECT * FROM sandboxes WHERE customer_id = ? ORDER BY created_at DESC').all(customerId);
}

export function getAllSandboxes() {
  return getDb().prepare('SELECT * FROM sandboxes ORDER BY created_at DESC').all();
}

export function getRunningSandboxes() {
  return getDb().prepare("SELECT * FROM sandboxes WHERE status = 'running'").all();
}

export function getAuditLog(limit = 50) {
  return getDb().prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?').all(limit);
}

export function getSecurityEvents(limit = 50) {
  return getDb().prepare('SELECT * FROM security_events ORDER BY created_at DESC LIMIT ?').all(limit);
}

export function getMetricsCache(sandboxId) {
  return getDb().prepare('SELECT * FROM metrics_cache WHERE sandbox_id = ?').get(sandboxId);
}

export function setMetricsCache(sandboxId, metrics) {
  getDb().prepare(
    `INSERT OR REPLACE INTO metrics_cache (sandbox_id, cpu, memory, net_in, net_out, disk, iops, history, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(sandboxId, metrics.cpu, metrics.memory, metrics.net_in, metrics.net_out, metrics.disk, metrics.iops, metrics.history);
}

// Credit tick — deduct running sandbox costs
export function tickCredits() {
  const d = getDb();
  const running = d.prepare("SELECT s.*, c.credits FROM sandboxes s JOIN customers c ON s.customer_id = c.id WHERE s.status = 'running'").all();

  const INSTANCE_PRICES = {
    'm8i.large': 0.1008, 'm8i.xlarge': 0.2016, 'm8i.2xlarge': 0.4032, 'm8i.4xlarge': 0.8064,
    'c8i.large': 0.0892, 'c8i.xlarge': 0.1785, 'c8i.2xlarge': 0.357,
    'r8i.large': 0.1323, 'r8i.xlarge': 0.2646, 'r8i.2xlarge': 0.5292,
    'm8i-flex.large': 0.09408, 'm8i-flex.xlarge': 0.18816,
    // Fallback 7th gen prices
    'm7i.large': 0.1008, 'm7i.xlarge': 0.2016, 'm7i.2xlarge': 0.4032, 'm7i.4xlarge': 0.8064,
    'c7i.large': 0.0892, 'c7i.xlarge': 0.1785, 'c7i.2xlarge': 0.357,
    'r7i.large': 0.1323, 'r7i.xlarge': 0.2646, 'r7i.2xlarge': 0.5292,
    'm7i-flex.large': 0.09408, 'm7i-flex.xlarge': 0.18816,
  };

  const TICK_INTERVAL = 60; // seconds between ticks
  const txn = d.transaction(() => {
    for (const s of running) {
      const priceHr = INSTANCE_PRICES[s.instance_type] || 0.20;
      const cost = priceHr / 3600 * TICK_INTERVAL;
      d.prepare('UPDATE sandboxes SET cost_accrued = cost_accrued + ? WHERE id = ?').run(cost, s.id);
      d.prepare('UPDATE customers SET credits = MAX(0, credits - ?), total_spent = total_spent + ? WHERE id = ?').run(cost, cost, s.customer_id);
    }
  });
  txn();
  return running.length;
}

// Grace period check — return sandboxes that should be auto-stopped
export function getGracePeriodSandboxes() {
  const d = getDb();
  return d.prepare(`
    SELECT s.id, s.instance_id, s.customer_id, c.credits
    FROM sandboxes s JOIN customers c ON s.customer_id = c.id
    WHERE s.status = 'running' AND c.credits <= 0
  `).all();
}

// ── Admin Setup ──

export function adminExists() {
  const d = getDb();
  const row = d.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get();
  return row.c > 0;
}

export function createAdmin(username, password, displayName) {
  if (!username || !password) throw new Error('Username and password are required');
  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  const d = getDb();
  const hash = bcrypt.hashSync(password, 10);
  d.prepare('INSERT INTO users (username, password_hash, role, display_name, customer_id) VALUES (?,?,?,?,?)').run(
    username, hash, 'admin', displayName || 'Platform Admin', null
  );
  audit('system', 'admin.create', username, `Admin user created: ${username}`);
}
