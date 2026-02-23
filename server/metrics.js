import { getRunningSandboxes, getMetricsCache, setMetricsCache, tickCredits, getGracePeriodSandboxes, updateSandbox, audit } from './db.js';
import { fetchInstanceMetrics, stopInstance, describeInstance } from './aws.js';

let pollingInterval = null;
let creditInterval = null;
let graceTimers = {}; // sandboxId → timestamp when grace started

export function startMetricsPolling(intervalMs = 60000) {
  if (pollingInterval) return;
  console.log(`[Metrics] Starting polling every ${intervalMs / 1000}s`);

  // Metrics poll
  pollingInterval = setInterval(async () => {
    const running = getRunningSandboxes();
    for (const sandbox of running) {
      if (!sandbox.instance_id) continue;
      try {
        const m = await fetchInstanceMetrics(sandbox.instance_id);
        const existing = getMetricsCache(sandbox.id);
        let history = [];
        try { history = JSON.parse(existing?.history || '[]'); } catch {}
        history.push({ cpu: m.cpu, mem: m.memory, ts: Date.now() });
        if (history.length > 60) history = history.slice(-60); // keep last 60 data points (1 hour)

        setMetricsCache(sandbox.id, { ...m, history: JSON.stringify(history) });
      } catch (e) {
        console.error(`[Metrics] Error fetching for ${sandbox.id}:`, e.message);
      }
    }
  }, intervalMs);

  // Credit tick every 60 seconds
  creditInterval = setInterval(() => {
    try {
      tickCredits();
      checkGracePeriod();
    } catch (e) {
      console.error('[Credits] Tick error:', e.message);
    }
  }, 60000);

  // Also sync instance states every 5 minutes
  setInterval(async () => {
    const running = getRunningSandboxes();
    for (const sandbox of running) {
      if (!sandbox.instance_id) continue;
      try {
        const info = await describeInstance(sandbox.instance_id);
        if (info && info.state !== 'running') {
          updateSandbox(sandbox.id, {
            status: info.state === 'stopped' ? 'stopped' : info.state === 'terminated' ? 'terminated' : sandbox.status,
            public_ip: info.publicIp || sandbox.public_ip,
            public_dns: info.publicDns || sandbox.public_dns,
          });
        }
      } catch {}
    }
  }, 300000);
}

async function checkGracePeriod() {
  const overdrawn = getGracePeriodSandboxes();
  const now = Date.now();
  const GRACE_MS = 3600000; // 1 hour

  for (const s of overdrawn) {
    if (!graceTimers[s.id]) {
      graceTimers[s.id] = now;
      console.log(`[Grace] Sandbox ${s.id} entered grace period (customer ${s.customer_id} at $0.00)`);
      audit('system', 'credit.grace', s.id, `Credits depleted for customer ${s.customer_id} — 1hr grace started`);
    } else if (now - graceTimers[s.id] > GRACE_MS) {
      // Grace expired — auto-stop
      console.log(`[Grace] Auto-stopping ${s.id} — grace period expired`);
      try {
        if (s.instance_id) await stopInstance(s.instance_id);
        updateSandbox(s.id, { status: 'stopped', stopped_at: new Date().toISOString() });
        audit('system', 'sandbox.autostop', s.id, `Auto-stopped: credits depleted for 1+ hours`);
      } catch (e) {
        console.error(`[Grace] Failed to auto-stop ${s.id}:`, e.message);
      }
      delete graceTimers[s.id];
    }
  }

  // Clear grace timers for sandboxes that have been topped up
  for (const sid of Object.keys(graceTimers)) {
    if (!overdrawn.find(s => s.id === sid)) {
      delete graceTimers[sid];
    }
  }
}

export function stopMetricsPolling() {
  if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
  if (creditInterval) { clearInterval(creditInterval); creditInterval = null; }
}
