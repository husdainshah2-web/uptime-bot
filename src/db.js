const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'uptime.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Monitors table
  db.exec(`
    CREATE TABLE IF NOT EXISTS monitors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      method TEXT DEFAULT 'GET',
      interval_minutes INTEGER DEFAULT 4,
      timeout_seconds INTEGER DEFAULT 20,
      expected_status INTEGER DEFAULT 200,
      is_active INTEGER DEFAULT 1,
      is_paused INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Checks history
  db.exec(`
    CREATE TABLE IF NOT EXISTS checks (
      id TEXT PRIMARY KEY,
      monitor_id TEXT NOT NULL,
      status_code INTEGER,
      response_time_ms INTEGER,
      is_up INTEGER NOT NULL,
      error_message TEXT,
      checked_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
    )
  `);

  // Incidents (downtime periods)
  db.exec(`
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      monitor_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_seconds INTEGER,
      status_code INTEGER,
      error_message TEXT,
      FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
    )
  `);

  // Alerts log
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      monitor_id TEXT NOT NULL,
      type TEXT NOT NULL, -- 'down' | 'recovered'
      message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
    )
  `);

  // Settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_checks_monitor_id ON checks(monitor_id);
    CREATE INDEX IF NOT EXISTS idx_checks_checked_at ON checks(checked_at);
    CREATE INDEX IF NOT EXISTS idx_incidents_monitor_id ON incidents(monitor_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_monitor_id ON alerts(monitor_id);
  `);

  // Create default admin if none exists
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)')
      .run(uuidv4(), username, hash);
    console.log(`✅ Default admin created: ${username} / ${password}`);
  }

  console.log('✅ Database initialized successfully');
  return db;
}

// Helper functions
const queries = {
  // Monitors
  getAllMonitors: db.prepare('SELECT * FROM monitors ORDER BY created_at DESC'),
  getActiveMonitors: db.prepare('SELECT * FROM monitors WHERE is_active = 1 AND is_paused = 0'),
  getMonitorById: db.prepare('SELECT * FROM monitors WHERE id = ?'),
  insertMonitor: db.prepare(`
    INSERT INTO monitors (id, name, url, method, interval_minutes, timeout_seconds, expected_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  updateMonitor: db.prepare(`
    UPDATE monitors SET name = ?, url = ?, method = ?, interval_minutes = ?, 
    timeout_seconds = ?, expected_status = ?, updated_at = datetime('now')
    WHERE id = ?
  `),
  pauseMonitor: db.prepare('UPDATE monitors SET is_paused = 1, updated_at = datetime(\'now\') WHERE id = ?'),
  resumeMonitor: db.prepare('UPDATE monitors SET is_paused = 0, updated_at = datetime(\'now\') WHERE id = ?'),
  deleteMonitor: db.prepare('DELETE FROM monitors WHERE id = ?'),

  // Checks
  insertCheck: db.prepare(`
    INSERT INTO checks (id, monitor_id, status_code, response_time_ms, is_up, error_message, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getChecksByMonitor: db.prepare(`
    SELECT * FROM checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT ?
  `),
  getRecentChecks: db.prepare(`
    SELECT * FROM checks WHERE monitor_id = ? AND checked_at >= datetime('now', ?)
    ORDER BY checked_at ASC
  `),
  getLastCheck: db.prepare(`
    SELECT * FROM checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 1
  `),

  // Incidents
  insertIncident: db.prepare(`
    INSERT INTO incidents (id, monitor_id, started_at, status_code, error_message)
    VALUES (?, ?, ?, ?, ?)
  `),
  closeIncident: db.prepare(`
    UPDATE incidents SET ended_at = ?, duration_seconds = ?
    WHERE id = ? AND ended_at IS NULL
  `),
  getOpenIncident: db.prepare(`
    SELECT * FROM incidents WHERE monitor_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1
  `),
  getIncidentsByMonitor: db.prepare(`
    SELECT * FROM incidents WHERE monitor_id = ? ORDER BY started_at DESC LIMIT ?
  `),

  // Alerts
  insertAlert: db.prepare(`
    INSERT INTO alerts (id, monitor_id, type, message) VALUES (?, ?, ?, ?)
  `),
  getAlerts: db.prepare(`
    SELECT a.*, m.name as monitor_name FROM alerts a
    JOIN monitors m ON a.monitor_id = m.id
    ORDER BY a.created_at DESC LIMIT ?
  `),

  // Stats helpers
  getUptimeStats: db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(is_up) as up_count
    FROM checks 
    WHERE monitor_id = ? AND checked_at >= datetime('now', ?)
  `),

  // Users
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
};

module.exports = { db, init, queries };
