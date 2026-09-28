const { v4: uuidv4 } = require('uuid');
const { queries } = require('./db');

/**
 * Perform a single HTTP check against a monitor
 */
async function checkMonitor(monitor) {
  const start = Date.now();
  let statusCode = null;
  let isUp = false;
  let errorMessage = null;
  let responseTime = 0;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), (monitor.timeout_seconds || 20) * 1000);

  try {
    const response = await fetch(monitor.url, {
      method: monitor.method || 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'UptimeBot/1.0 (+https://github.com/uptime-bot)',
        'Accept': '*/*',
      },
      redirect: 'follow',
    });

    clearTimeout(timeoutId);
    responseTime = Date.now() - start;
    statusCode = response.status;

    // Consider 2xx and 3xx as UP by default, or match expected_status
    const expected = monitor.expected_status || 200;
    isUp = response.status === expected || (expected === 200 && response.status >= 200 && response.status < 400);

  } catch (err) {
    clearTimeout(timeoutId);
    responseTime = Date.now() - start;
    errorMessage = err.name === 'AbortError' 
      ? `Timeout after ${monitor.timeout_seconds}s` 
      : (err.message || 'Unknown error');
    isUp = false;
  }

  const checkedAt = new Date().toISOString();
  const checkId = uuidv4();

  // Store the check
  queries.insertCheck.run(
    checkId,
    monitor.id,
    statusCode,
    responseTime,
    isUp ? 1 : 0,
    errorMessage,
    checkedAt
  );

  // Handle incidents & alerts
  handleStatusChange(monitor, isUp, statusCode, errorMessage, checkedAt);

  return {
    id: checkId,
    monitorId: monitor.id,
    statusCode,
    responseTime,
    isUp,
    errorMessage,
    checkedAt,
  };
}

/**
 * Detect status changes and create incidents/alerts
 */
function handleStatusChange(monitor, isUp, statusCode, errorMessage, checkedAt) {
  const lastCheck = queries.getLastCheck.get(monitor.id);
  // Note: lastCheck is the previous one because we just inserted the current

  const openIncident = queries.getOpenIncident.get(monitor.id);

  if (!isUp) {
    // Currently DOWN
    if (!openIncident) {
      // New incident
      const incidentId = uuidv4();
      queries.insertIncident.run(
        incidentId,
        monitor.id,
        checkedAt,
        statusCode,
        errorMessage
      );

      // Create DOWN alert
      const msg = `🔴 WEBSITE DOWN\n\n${monitor.name}\n${monitor.url}\n\nStatus: ${statusCode || 'N/A'}\nDetected: ${new Date(checkedAt).toLocaleString()}\n${errorMessage ? 'Error: ' + errorMessage : ''}`;
      queries.insertAlert.run(uuidv4(), monitor.id, 'down', msg);
      console.log(`[ALERT] DOWN → ${monitor.name}`);
    }
  } else {
    // Currently UP
    if (openIncident) {
      // Recovered
      const started = new Date(openIncident.started_at);
      const ended = new Date(checkedAt);
      const durationSec = Math.round((ended - started) / 1000);

      queries.closeIncident.run(checkedAt, durationSec, openIncident.id);

      const durationStr = formatDuration(durationSec);
      const msg = `🟢 WEBSITE RECOVERED\n\n${monitor.name}\n${monitor.url}\n\nDowntime: ${durationStr}\nCurrent response: ${statusCode ? statusCode + ' OK' : 'OK'}`;
      queries.insertAlert.run(uuidv4(), monitor.id, 'recovered', msg);
      console.log(`[ALERT] RECOVERED → ${monitor.name} (downtime ${durationStr})`);
    }
  }
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

/**
 * Run checks for all active monitors (with concurrency limit)
 */
async function runAllChecks() {
  const monitors = queries.getActiveMonitors.all();
  if (monitors.length === 0) {
    console.log('[Checker] No active monitors');
    return [];
  }

  console.log(`[Checker] Running checks for ${monitors.length} monitor(s)...`);

  // Simple concurrency: process in batches of 5
  const results = [];
  const batchSize = 5;

  for (let i = 0; i < monitors.length; i += batchSize) {
    const batch = monitors.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(m => checkMonitor(m)));
    results.push(...batchResults);
  }

  const upCount = results.filter(r => r.isUp).length;
  console.log(`[Checker] Done. ${upCount}/${results.length} UP`);
  return results;
}

module.exports = { checkMonitor, runAllChecks };
