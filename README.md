# 🟢 Uptime Bot — Full Monitoring Dashboard

A complete, self-hosted **Uptime Monitoring Bot + Professional Dashboard** built with pure **Node.js**.

## Features

- ✅ Automatic HTTP checks every **4 minutes** (configurable)
- ✅ Beautiful dark dashboard with real-time overview
- ✅ Add / Pause / Resume / Delete monitors
- ✅ Response time graphs (Chart.js)
- ✅ Uptime % for 24h / 7d / 30d
- ✅ Incident tracking (downtime periods)
- ✅ Alert history (DOWN + RECOVERED)
- ✅ Full check logs
- ✅ JWT authentication (admin login)
- ✅ SQLite database (zero external DB setup)
- ✅ Server-side scheduler (`node-cron`) — works even if browser is closed

## Tech Stack

| Layer       | Technology              |
|-------------|-------------------------|
| Backend     | Node.js + Express       |
| Database    | SQLite (better-sqlite3) |
| Scheduler   | node-cron               |
| Auth        | JWT + bcrypt            |
| Frontend    | Vanilla JS + Tailwind CSS + Chart.js |
| Charts      | Chart.js (CDN)          |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env

# 3. Start the server
npm start
```

Open → **http://localhost:3000**

**Default login:**
- Username: `admin`
- Password: `admin123`

> Change these in `.env` before deploying to production!

## Project Structure

```
uptime-bot/
├── src/
│   ├── server.js      # Express entry point
│   ├── db.js          # SQLite schema + queries
│   ├── checker.js     # HTTP check logic + incident detection
│   ├── scheduler.js   # node-cron background worker
│   ├── auth.js        # JWT login middleware
│   └── routes.js      # All API endpoints
├── public/
│   ├── index.html     # Dashboard UI
│   └── app.js         # Frontend logic
├── data/              # SQLite database (auto-created)
├── .env.example
├── package.json
└── README.md
```

## API Endpoints

| Method | Endpoint                    | Description              |
|--------|-----------------------------|--------------------------|
| POST   | `/api/auth/login`           | Login                    |
| GET    | `/api/dashboard`            | Overview + monitor cards |
| GET    | `/api/monitors`             | List all monitors        |
| POST   | `/api/monitors`             | Create monitor           |
| GET    | `/api/monitors/:id`         | Monitor details + history|
| PUT    | `/api/monitors/:id`         | Update monitor           |
| POST   | `/api/monitors/:id/pause`   | Pause                    |
| POST   | `/api/monitors/:id/resume`  | Resume                   |
| DELETE | `/api/monitors/:id`         | Delete                   |
| POST   | `/api/monitors/:id/check`   | Force check now          |
| GET    | `/api/alerts`               | Alert history            |
| GET    | `/api/incidents`            | Incident history         |
| GET    | `/api/logs`                 | Raw check logs           |

## How the Scheduler Works

```
Server starts
    ↓
node-cron every 4 minutes
    ↓
Fetch all active (non-paused) monitors
    ↓
Send concurrent HTTP requests (batch of 5)
    ↓
Store status_code, response_time, is_up, error
    ↓
Detect status change → create Incident + Alert
    ↓
Dashboard auto-refreshes every 30s
```

## Production Tips

1. Change `JWT_SECRET` and admin password in `.env`
2. Use PM2: `pm2 start src/server.js --name uptime-bot`
3. Put behind Nginx / Caddy with HTTPS
4. For many monitors, consider switching SQLite → PostgreSQL
5. Future: add Discord / Telegram / Email webhooks in `checker.js`

## License

MIT
