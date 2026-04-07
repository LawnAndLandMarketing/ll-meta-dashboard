# L&L Meta Ads Dashboard

**Live URL:** https://meta.groundcontrol.agency  
**Backup URL:** https://ll-meta-dashboard.vercel.app  
**GitHub:** https://github.com/LawnAndLandMarketing/ll-meta-dashboard  
**Stack:** Vanilla HTML/CSS/JS · Vercel Serverless Functions (Node.js) · Meta Graph API v21.0

---

## What This Is

A real-time Meta Ads monitoring dashboard for Lawn & Land Marketing's client portfolio. Monitors 35 ad accounts, detects issues automatically, and has Kai run a structured twice-daily review with a Telegram alert and an in-dashboard summary panel.

Built in March 2026 after the departure of the Meta Ads department head. Kai (AI agent) now serves as the Meta Ads department oversight layer.

---

## Features

### Dashboard
- **35-account portfolio view** — health-sorted (critical → warning → healthy → inactive)
- **Campaign type detection** — automatically classifies each account as Leads, Awareness, or Mixed
- **Separated metrics** — Leads filter shows leads-only data; Awareness shows awareness-only data; Mixed accounts never blend the two
- **Per-account drill-down** — click any row for full stats breakdown + direct Ads Manager link
- **Ignore list** — mark accounts you don't manage (e.g. client-owned read-access accounts); they're excluded from all stats and filters, stored in `localStorage`
- **Real-time health badges** — 🔴 Critical / ⚠️ Warning / ✅ Healthy with specific flag reasons
- **Auto-refresh** — polls the API every 5 minutes
- **Direct Ads Manager link** — arrow icon on each row opens that client's account directly

### Kai's Review System
- **Runs twice daily** — 8 AM ET (morning briefing before team arrives) + 1 PM ET (midday check)
- **Weekdays only** — crons are Monday–Friday
- **Scans for:** account restrictions, no payment method, policy violations, spend with 0 leads, CPL spikes (2.5x 7-day avg), no active campaigns
- **Writes a structured review** to `data/reviews.json` in this repo (last 14 reviews = 7 days)
- **Sends Telegram alert** to Matt (7098235872) only if issues are found — silence = all clear
- **In-dashboard panel** — "Kai's Review" button in bottom-right corner shows:
  - Plain-English summary paragraph
  - Today's portfolio spend + leads
  - Critical issues list
  - Warnings list
  - Top 3 accounts by CPL today
  - Log of last 4 previous reviews

---

## Project Structure

```
ll-meta-dashboard/
├── index.html              # Full dashboard UI — single file, no build step
├── api/
│   ├── meta.js             # Main data endpoint — all 35 accounts, insights, campaign types, health flags
│   ├── kai-review.js       # Review endpoint — scan, write review, send Telegram if needed. Also serves GET for sidebar
│   └── health-check.js     # Legacy basic health check (superseded by kai-review.js)
├── data/
│   └── reviews.json        # Kai's review history — last 14 reviews (7 days at 2/day)
├── vercel.json             # Cron schedule, rewrites, CORS headers
└── README.md               # This file
```

---

## How It Works

### Main Data Flow (Dashboard)

```
Browser → GET /api/meta (cached 5 min)
  → Meta Graph API: me/adaccounts (all 35 accounts)
  → Per account (parallel):
      → campaigns (active only) → detect type: leads / awareness / mixed
      → insights: today, MTD, last 7 days
      → For mixed accounts: campaign-level insights split by objective type
      → Policy violations (disapproved/with-issues ads)
  → Compute health flags
  → Return sorted JSON
Dashboard renders → filter/ignore state from localStorage
```

### Campaign Type Detection

Active campaigns are checked against objective lists:

| Type | Meta Campaign Objectives |
|---|---|
| **Leads** | `OUTCOME_LEADS`, `LEAD_GENERATION`, `CONVERSIONS`, `OUTCOME_SALES` |
| **Awareness** | `OUTCOME_AWARENESS`, `REACH`, `VIDEO_VIEWS`, `BRAND_AWARENESS`, `PAGE_LIKES` |
| **Mixed** | Has both types active simultaneously |
| **Other** | Active campaigns with different objectives |
| **Unknown** | No active campaigns |

**Important:** For Mixed accounts, metrics are **never blended**. When viewing the Leads filter, you see leads-campaign spend/CPL only. When viewing Awareness, you see awareness-campaign impressions/reach/CPM only. This is done via campaign-level API queries filtered by objective.

### Health Flag Logic

| Flag | Trigger | Type |
|---|---|---|
| `ACCOUNT_RESTRICTED` | `account_status !== 1` | 🔴 Critical |
| `NO_PAYMENT` | No funding source on account | 🔴 Critical |
| `POLICY_ISSUES` | Any ad in DISAPPROVED or WITH_ISSUES state | ⚠️ Warning |
| `SPEND_NO_LEADS` | Spent >$15 today with 0 leads (leads accounts only) | ⚠️ Warning |
| `CPL_SPIKE` | Today's CPL > 2.5x the 7-day average | ⚠️ Warning |
| `NO_CAMPAIGNS` | Active account with no campaigns running | ℹ️ Info |

### Kai's Review Flow

```
Cron fires (8 AM or 1 PM ET, weekdays)
  → /api/kai-review (POST)
  → Fetches all accounts + today's insights + 7d insights
  → Evaluates all health flags per account
  → Builds structured review object:
      { session, reviewedAt, summary, stats, critical[], warnings[], topPerformers[] }
  → Reads current data/reviews.json from GitHub (gets SHA)
  → Prepends new review, trims to 14, writes back via GitHub Contents API
  → If critical.length > 0 or warnings.length > 0 → sends Telegram alert to Matt
  → Returns { ok, summary, critical, warnings, healthy }

Dashboard sidebar → GET /api/kai-review
  → Reads data/reviews.json from GitHub
  → Returns full review history for the panel
```

### Ignore List

Stored in `localStorage` under key `ll_meta_ignored`. Array of Meta account IDs.  
Ignored accounts are excluded from:
- All summary stats (total, critical, warning, healthy, spend, leads)
- All filter views
- Health check cron alerts

Visible only when clicking the "🙈 Ignored" filter tab.  
Un-ignore by clicking 👁 on any ignored account.

---

## Environment Variables

Set in Vercel project settings → Environment Variables:

| Variable | Required | Description |
|---|---|---|
| `META_SYSTEM_USER_TOKEN` | ✅ | Meta system user token with `ads_read`, `ads_management` permissions |
| `TELEGRAM_BOT_TOKEN` | ✅ | Telegram bot token for Kai review alerts |
| `TELEGRAM_CHAT_ID` | ✅ | Matt's Telegram user ID (`7098235872`) |
| `GITHUB_TOKEN` | ✅ | GitHub PAT with `repo` scope — used to read/write `data/reviews.json` |

---

## Cron Schedule

Defined in `vercel.json`. Runs Monday–Friday only (no weekend noise):

```json
"crons": [
  { "path": "/api/kai-review", "schedule": "0 12 * * 1-5" },   // 8 AM ET
  { "path": "/api/kai-review", "schedule": "0 17 * * 1-5" }    // 1 PM ET
]
```

Times are in UTC. ET = UTC-4 (EDT) / UTC-5 (EST).

---

## Telegram Alert Format

Only fires when issues exist. Silence = all green.

```
🔍 Kai's Meta Review — 8:00 AM ET
Portfolio spent $412 today, 14 leads.

🔴 Critical (1)

Premium Landscape Services
  • Account RESTRICTED

⚠️ Warnings (2)

Sparta Lawn Care
  • $47 spent, 0 leads today

Rock Solid Nevada
  • CPL spike: $210 today vs $84 avg (2.5x spike)

👉 View Dashboard → https://meta.groundcontrol.agency
```

---

## Deployment

No build step. Pure static HTML + Vercel serverless functions.

```bash
# Clone
git clone https://github.com/LawnAndLandMarketing/ll-meta-dashboard.git
cd ll-meta-dashboard

# Set environment variables in Vercel dashboard, then deploy:
vercel deploy --prod
```

Pushes to `main` auto-deploy via GitHub → Vercel integration.

---

## Meta API Access

Uses a **Meta System User** (`Kai`, ID: `122098531407285468`) under the **Lawn & Land Automation** app in L&L Business Manager.

System user has `ads_read` + `ads_management` permissions across all 35 client ad accounts.

**Token storage:**
- Vercel: `META_SYSTEM_USER_TOKEN` env var
- Kai's Mac (agent-vault): `meta-system-user-token`

**If token expires:** Meta Business Manager → Business Settings → System Users → Kai → Generate Token → update both locations.

---

## Known Accounts (March 2026)

35 accounts total. **Recommend ignoring these 6** via the dashboard 🙈 button — they are client-owned accounts L&L has read access to but does not manage:

| Account | Status | Notes |
|---|---|---|
| Premium Landscape Services | 🔴 Restricted | Client-owned, don't manage |
| Independent Lawn Service | 🔴 Restricted | Client-owned, don't manage |
| From The Ground Up - Landscape | 🔴 Restricted | Client-owned, don't manage |
| Outdoor Perfection Landscaping | 🔴 Restricted | Client-owned, don't manage |
| B/A Farms | 🔴 Restricted | Client-owned, don't manage |
| P&C Solutions | 🔴 Restricted | Client-owned, don't manage |

**Mixed accounts (Leads + Awareness):**
- Lawn & Land Marketing (own account)
- Sparta Lawn Care
- Rock Solid Landscape - Ohio
*(others may be added over time)*

---

## Development Notes

- **No dependencies** — zero npm packages in the frontend. `index.html` is fully self-contained.
- **API response cached** by Vercel CDN for 5 minutes (`s-maxage=300, stale-while-revalidate=600`).
- **Mixed account API calls** — campaign-level queries add ~2 extra API calls per mixed account per page load.
- **Rate limits** — Meta Graph API: 200 calls/hour per user token. Full refresh ≈ 245 calls. Don't refresh more than once per 90 seconds.
- **Review storage** — `data/reviews.json` in this repo. Written via GitHub Contents API using a PAT with `repo` scope. Keeps last 14 reviews (7 days).
- **Design system** — L&L Digital UI Standard: `#040a04` background, `#ACE71D` lime, Rethink Sans headings. Documented in `skills/ll-design-system/` in Kai's workspace.

---

## Roadmap

| Version | Status | Description |
|---|---|---|
| v1 | ✅ Live (Mar 2026) | Core dashboard, health flags, campaign type detection, ignore list, direct Ads Manager links |
| v1.1 | ✅ Live (Mar 2026) | Kai's Review system — twice-daily crons, Telegram alerts, in-dashboard review sidebar |
| v2 | Planned | Spend trend sparklines (7-day), per-client budget pacing % |
| v3 | Planned | Weekly Monday email digest — full portfolio performance summary |
| v4 | Planned | Account-level notes/labels ("paused for winter", "new client onboarding") |
| Quiz Sprint 4 | Planned | Meta Custom Audiences from SAE quiz tags (quiz funnel retargeting) |

---

## Maintainer

**Kai** — AI Operations Agent + Meta Ads Oversight, Lawn & Land Marketing  
Contact: Matt Foreman (matt@lawnandlandmarketing.com)  
Internal tool — L&L use only.

*Built March 22–23, 2026.*

---

## Repository Relationship

- **Canonical product:** Meta Ads Dashboard
- **This repo is the source of truth**
- **Live URL:** https://meta.groundcontrol.agency
- **Related repos:** None directly — reads from Meta Graph API, writes to `data/reviews.json` in this repo
- **Depends on:** Vercel (hosting + serverless functions), Meta Graph API v21.0, OpenClaw/Kai (cron reviews)

> **⚠️ Naming note:** Was `ll-meta-dashboard` — renamed to `meta-dashboard` April 2026.
