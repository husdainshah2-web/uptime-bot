try { require('dotenv').config(); } catch (e) { /* optional */ }
const express = require('express');
const cors = require('cors');
const path = require('path');
const { init } = require('./db');
const { startScheduler } = require('./scheduler');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api', routes);

// Health check (public)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start
init();
startScheduler(parseInt(process.env.CHECK_INTERVAL_MINUTES) || 4);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════╗
║         🟢  UPTIME BOT  is running           ║
╠══════════════════════════════════════════════╣
║  Dashboard → http://localhost:${PORT}             
║  API       → http://localhost:${PORT}/api          
║  Health    → http://localhost:${PORT}/health       
╚══════════════════════════════════════════════╝
  `);
});
