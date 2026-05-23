# BHAT Deadline Bot — Setup Guide

## What This Does
The BHAT Bot brings deadline management directly into Discord. Your team can add, view, and update transaction deadlines using native Discord slash commands — no external apps or browser tabs needed.

## Commands (type in any channel)
| Command | What it does |
|---|---|
| `/deadline add` | Opens a form to add a new deadline |
| `/deadline list` | Shows all open deadlines (can filter by team or priority) |
| `/deadline today` | Shows anything due in the next 24 hours or overdue |
| `/deadline stats` | Shows a summary: how many open, overdue, by team |

Each deadline shows with buttons to mark **Complete**, **In Progress**, or **Delete** right from the embed.

The bot also checks for urgent deadlines every 30 minutes and posts alerts to #🔔-deadline-alerts automatically.

---

## One-Time Setup (5 minutes)

### Step 1 — Get your bot token
1. Go to: https://discord.com/developers/applications/1504976671634231367/bot
2. Click **Reset Token** → confirm → copy the token (only shown once!)

### Step 2 — Create your .env file
In the `bot/` folder, create a file called `.env` (copy from `.env.example`):

```
DISCORD_BOT_TOKEN=paste_your_token_here
GUILD_ID=1504973606638194718
API_BASE_URL=http://localhost:5000
CHANNEL_DEADLINE_DASHBOARD=1506643027626688602
CHANNEL_DEADLINE_ALERTS=1506643134090706964
CHANNEL_DEADLINE_STATS=1506643222586462238
```

> Everything except the token is already filled in for you.

### Step 3 — Run the bot
Open a terminal, navigate to the repo, then:

```bash
cd bot
npm install
node bot.js
```

You should see:
```
BHAT Bot#6098 online
Slash commands registered
```

Done! Type `/deadline` in any channel to verify it works.

---

## Running the Full Stack (Bot + Backend Together)

The bot talks to the Express backend to store deadlines. Run both at the same time:

**Terminal 1 — Backend:**
```bash
cd server
npm install
node index.js
```

**Terminal 2 — Bot:**
```bash
cd bot
npm install
node bot.js
```

---

## Production Deployment
- Backend: Already set up for Heroku via `Procfile`. Set `MONGODB_URI` in Heroku config vars.
- Bot: Can run on any Node.js host (Railway, Render, VPS). Set all env vars in the host's dashboard.
- Update `API_BASE_URL` in the bot's .env to point to your live Heroku URL once deployed.

---

## Troubleshooting
| Issue | Fix |
|---|---|
| `/deadline` doesn't appear | Wait 1-2 minutes after bot starts for slash commands to register |
| `Invalid token` error | Reset token again in Developer Portal and update .env |
| Deadlines not saving | Make sure the backend server is running and `API_BASE_URL` is correct |
| Bot offline | Check that `node bot.js` is still running in your terminal |
