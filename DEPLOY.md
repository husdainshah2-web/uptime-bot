# Deploy Uptime Bot to Render (via GitHub)

Yeh project Render ke liye ready hai.

## 1) GitHub par repo banao

Apne computer par `uptime-bot` folder ke andar:

```bash
cd uptime-bot
git init
git add .
git commit -m "Initial uptime bot dashboard"
```

Phir GitHub.com par **New repository** banao (Public ya Private).

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/uptime-bot.git
git push -u origin main
```

`.env` file push **mat** karna — `.gitignore` mein already hai.

## 2) Render se connect karo

1. [https://dashboard.render.com](https://dashboard.render.com) par login
2. **New +** → **Web Service**
3. **Connect GitHub** (pehle baar GitHub authorize karna padega)
4. Repo `uptime-bot` select karo
5. Settings:

| Field | Value |
|-------|--------|
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance | Free |

## 3) Environment Variables (Render → Environment)

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | koi lamba random secret |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | apna strong password |
| `CHECK_INTERVAL_MINUTES` | `4` |
| `DATA_DIR` | `/opt/render/project/src/data` |

`PORT` khud Render set karta hai. Mat add karo.

## 4) Deploy

**Create Web Service** dabao. 2–5 minute lagte hain.

Live URL example: `https://uptime-bot-xxxx.onrender.com`

Login: jo username/password env mein set kiye.

## Important (Free plan)

- Render Free service ~15 min inactivity ke baad **sleep** ho jati hai.
- Sleep ke dauran 4-minute checks **ruk** jate hain.
- Wapas jaagne par SQLite file reset ho sakti hai (Free disk ephemeral hai).
- 24/7 monitoring ke liye **Starter plan + Persistent Disk** better hai.

Health check: `https://YOUR-URL.onrender.com/health`
