const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queries, db } = require('./db');
const { checkMonitor } = require('./checker');

const router = express.Router();

// ============ DASHBOARD OVERVIEW ============
router.get('/dashboard', (req, res) => {
  const monitors = queries.getAllMonitors.all();

  let up = 0, down = 0, paused = 0;
  let totalResponse = 0, responseCount = 0;
  let checksToday = 0, failedToday = 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const monitorCards = monitors.map(m => {
    const last = queries.getLastCheck.get(m.id);
    const isPaused = m.is_paused === 1;

    if (isPaused) paused++;
    else if (last && last.is_up) up++;
    else if (last) down++;
    else up++; // no checks yet → assume ok

    // 24h uptime
    const stats24 = queries.getUptimeStats.get(m.id, '-24 hours');
    const uptime24 = stats24.total > 0
      ? ((stats24.up_count / stats24.total) * 100).toFixed(2)
      : null;

    if (last) {
      totalResponse += last.response_time_ms || 0;
      responseCount++;
    }

    // Today's checks
    const todayChecks = db.prepare(`
      SELECT COUNT(*) as total, SUM(CASE WHEN is_up = 0 THEN 1 ELSE 0 END) as failed
      FROM checks WHERE monitor_id = ? AND checked_at >= ?
    `).get(m.id, todayStart.toISOString());

    checksToday += todayChecks.total || 0;
    failedToday += todayChecks.failed || 0;

    return {
      id: m.id,
      name: m.name,
      url: m.url,
      status: isPaused ? 'paused' : (last ? (last.is_up ? 'up' : 'down') : 'unknown'),
      responseTime: last ? last.response_time_ms : null,
      lastCheck: last ? last.checked_at : null,
      uptime: uptime24,
      isPaused,
    };
  });

  const overallUptime = monitors.length > 0
    ? ((up / (up + down || 1)) * 100).toFixed(2)
    : '100.00';

  res.json({
    overview: {
      sitesUp: up,
      sitesDown: down,
      sitesPaused: paused,
      totalMonitors: monitors.length,
      uptimePercent: overallUptime,
      avgResponseTime: responseCount > 0 ? Math.round(totalResponse / responseCount) : null,
      checksToday,
      failedChecks: failedToday,
      lastCheck: monitorCards.reduce((latest, m) => {
        if (!m.lastCheck) return latest;
        return !latest || m.lastCheck > latest ? m.lastCheck : latest;
      }, null),
    },
    monitors: monitorCards,
  });
});

// ============ MONITORS CRUD ============
router.get('/monitors', (req, res) => {
  const monitors = queries.getAllMonitors.all();
  res.json(monitors);
});

router.post('/monitors', (req, res) => {
  const { name, url, method = 'GET', interval_minutes = 4, timeout_seconds = 20, expected_status = 200 } = req.body;

  if (!name || !url) {
    return res.status(400).json({ error: 'Name and URL are required' });
  }

  try {
    new URL(url); // validate
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const id = uuidv4();
  queries.insertMonitor.run(id, name, url, method.toUpperCase(), interval_minutes, timeout_seconds, expected_status);

  // Trigger immediate check
  const monitor = queries.getMonitorById.get(id);
  checkMonitor(monitor).catch(() => {});

  res.status(201).json({ id, name, url, message: 'Monitor created' });
});

router.get('/monitors/:id', (req, res) => {
  const monitor = queries.getMonitorById.get(req.params.id);
  if (!monitor) return res.status(404).json({ error: 'Monitor not found' });

  const lastCheck = queries.getLastCheck.get(monitor.id);
  const checks = queries.getChecksByMonitor.all(monitor.id, 100);
  const incidents = queries.getIncidentsByMonitor.all(monitor.id, 20);

  // Uptime periods
  const periods = [
    { label: '24 Hours', range: '-24 hours' },
    { label: '7 Days', range: '-7 days' },
    { label: '30 Days', range: '-30 days' },
  ];

  const uptimeHistory = periods.map(p => {
    const stats = queries.getUptimeStats.get(monitor.id, p.range);
    return {
      label: p.label,
      uptime: stats.total > 0 ? ((stats.up_count / stats.total) * 100).toFixed(2) : null,
      totalChecks: stats.total,
    };
  });

  // Response time series for chart (last 24h)
  const recent = queries.getRecentChecks.all(monitor.id, '-24 hours');

  res.json({
    monitor,
    lastCheck,
    uptimeHistory,
    responseTimeSeries: recent.map(c => ({
      time: c.checked_at,
      ms: c.response_time_ms,
      up: !!c.is_up,
    })),
    checks: checks.map(c => ({
      time: c.checked_at,
      status: c.is_up ? 'UP' : 'DOWN',
      code: c.status_code,
      response: c.response_time_ms,
      error: c.error_message,
    })),
    incidents,
  });
});

router.put('/monitors/:id', (req, res) => {
  const monitor = queries.getMonitorById.get(req.params.id);
  if (!monitor) return res.status(404).json({ error: 'Monitor not found' });

  const { name, url, method, interval_minutes, timeout_seconds, expected_status } = req.body;
  queries.updateMonitor.run(
    name || monitor.name,
    url || monitor.url,
    (method || monitor.method).toUpperCase(),
    interval_minutes ?? monitor.interval_minutes,
    timeout_seconds ?? monitor.timeout_seconds,
    expected_status ?? monitor.expected_status,
    monitor.id
  );

  res.json({ message: 'Monitor updated' });
});

router.post('/monitors/:id/pause', (req, res) => {
  queries.pauseMonitor.run(req.params.id);
  res.json({ message: 'Monitor paused' });
});

router.post('/monitors/:id/resume', (req, res) => {
  queries.resumeMonitor.run(req.params.id);
  res.json({ message: 'Monitor resumed' });
});

router.delete('/monitors/:id', (req, res) => {
  queries.deleteMonitor.run(req.params.id);
  res.json({ message: 'Monitor deleted' });
});

// Force check now
router.post('/monitors/:id/check', async (req, res) => {
  const monitor = queries.getMonitorById.get(req.params.id);
  if (!monitor) return res.status(404).json({ error: 'Monitor not found' });

  try {
    const result = await checkMonitor(monitor);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ ALERTS & INCIDENTS ============
router.get('/alerts', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const alerts = queries.getAlerts.all(limit);
  res.json(alerts);
});

router.get('/incidents', (req, res) => {
  const incidents = db.prepare(`
    SELECT i.*, m.name as monitor_name, m.url
    FROM incidents i
    JOIN monitors m ON i.monitor_id = m.id
    ORDER BY i.started_at DESC
    LIMIT 50
  `).all();
  res.json(incidents);
});

// ============ LOGS ============
router.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const logs = db.prepare(`
    SELECT c.*, m.name as monitor_name, m.url
    FROM checks c
    JOIN monitors m ON c.monitor_id = m.id
    ORDER BY c.checked_at DESC
    LIMIT ?
  `).all(limit);
  res.json(logs);
});

module.exports = router;
