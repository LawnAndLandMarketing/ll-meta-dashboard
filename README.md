# L&L Meta Ads Dashboard

**Live URL:** https://meta.groundcontrol.agency  
**Backup URL:** https://ll-meta-dashboard.vercel.app  
**GitHub:** https://github.com/LawnAndLandMarketing/ll-meta-dashboard  
**Stack:** Vanilla HTML/CSS/JS frontend · Vercel Serverless Functions (Node.js) · Meta Graph API v21.0

---

## What This Is

A real-time Meta Ads monitoring dashboard for Lawn & Land Marketing's client portfolio. Monitors 35 ad accounts across all clients, detects issues automatically, and sends Telegram alerts twice daily.

Built to replace manual ad manager oversight after the departure of the Meta Ads department head in March 2026.

---

## Features

- **35-account portfolio view** — all clients in one place, health-sorted (critical → warning → healthy)
- **Campaign type detection** — automatically classifies each account as Leads, Awareness, or Mixed
- **Separated metrics** — clicking Leads shows leads-only data; clicking Awareness shows awareness-only data; Mixed accounts never blend the two
- **Per-account drill-down** — click any row for full stats, campaign list, and direct Ads Manager link
- **Ignore list** — mark accounts you don't manage (e.g. client-owned accounts you have read access to) so they're excluded from all stats and views
- **Real-time health badges** — 🔴 Critical / ⚠️ Warning / ✅ Healthy based on account status, policy violations, CPL spikes, and spend-with-no-leads
- **Auto-refresh** — dashboard polls the API every 5 minutes
- **Twice-daily health check cron** — runs at 8 AM and 6 PM ET, sends Telegram alert only if issues are found

---

## Project Structure

```
ll-meta-dashboard/
├── index.html          # Full dashboard UI (single-file, no build step)
├── api/
│   ├── meta.js         # Main data endpoint — fetches all 35 accounts, insights, campaign types
│   └── health-check.js # Cron endpoint — scans for issues, fires Telegram alert if needed
├── vercel.json         # Vercel config — rewrites, CORS headers, twice-daily crons
└── README.md           # This file
```

---

## How It Works

### Data Flow

```
Browser → GET /api/meta
  → Meta Graph API: me/adaccounts (all 35 accounts)
  → Per account (parallel):
      → campaigns (active only) → detect type: leads / awareness / mixed
      → insights: today, MTD, last 7 days (account-level)
      → For mixed accounts: campaign-level insights split by type (no blending)
      → Policy violations (disapproved/with-issues ads)
  → Compute health flags
  → Return sorted JSON
Browser renders → filter/ignore state from localStorage
```

### Campaign Type Detection

Active campaigns are checked against objective lists:

| Type | Meta Objectives |
|---|---|
| Leads | `OUTCOME_LEADS`, `LEAD_GENERATION`, `CONVERSIONS`, `OUTCOME_SALES` |
| Awareness | `OUTCOME_AWARENESS`, `REACH`, `VIDEO_VIEWS`, `BRAND_AWARENESS`, `PAGE_LIKES` |
| Mixed | Has both types active simultaneously |
| Other | Active campaigns with different objectives |
| Unknown | No active campaigns |

### Health Flag Logic

| Flag | Trigger |
|---|---|
| `ACCOUNT_RESTRICTED` | `account_status !== 1` |
| `POLICY_ISSUES` | Any ad in DISAPPROVED or WITH_ISSUES state |
| `SPEND_NO_LEADS` | Spent >$15 today with 0 leads (leads accounts only) |
| `CPL_SPIKE` | Today's CPL > 2.5x the 7-day average |

### Ignore List

Stored in `localStorage` under key `ll_meta_ignored`. Array of Meta account IDs (e.g. `["act_362775014"]`).  
Ignored accounts are excluded from:
- All summary stats (total, critical, warning, healthy, spend, leads)
- All filter views (All Accounts, Leads, Awareness, Mixed)
- Health check cron alerts

They're only visible when clicking the "🙈 Ignored" filter tab.

---

## Environment Variables

Set in Vercel project settings → Environment Variables:

| Variable | Required | Description |
|---|---|---|
| `META_SYSTEM_USER_TOKEN` | ✅ | Meta system user token with `ads_read`, `ads_management` permissions across all client ad accounts |
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token for health check alerts |
| `TELEGRAM_CHAT_ID` | ✅ | Matt's Telegram user ID (7098235872) for direct alerts |

---

## Cron Schedule

Defined in `vercel.json`. Vercel runs these automatically on the Pro plan:

```json
"crons": [
  { "path": "/api/health-check", "schedule": "0 12 * * *" },  // 8 AM ET
  { "path": "/api/health-check", "schedule": "0 22 * * *" }   // 6 PM ET
]
```

The health check only fires a Telegram alert if issues are found. Silence = all green.

---

## Alert Format

When issues are found, Kai receives a Telegram message:

```
🔍 Meta Ads Health Check — 8:00 AM ET
Checked 35 accounts

🔴 CRITICAL (1 account)

Premium Landscape Services
  🔴 Account RESTRICTED

⚠️ WARNINGS (2 accounts)

Sparta Lawn Care
  ⚠️ $47 spent today, 0 leads

Rock Solid Nevada
  📈 CPL spike: $210 today vs $84 avg (2.5x)

👉 View Dashboard → https://meta.groundcontrol.agency
```

---

## Deployment

No build step. Pure static HTML + Vercel serverless functions.

```bash
# Clone
git clone https://github.com/LawnAndLandMarketing/ll-meta-dashboard.git
cd ll-meta-dashboard

# Deploy to Vercel (requires Vercel CLI + token)
vercel deploy --prod
```

Or push to `main` — Vercel auto-deploys via GitHub integration.

**Manual deploy via API (Kai's standard method):**
```bash
# Build payload and POST to Vercel deployments API
# See Kai's workspace memory for token and team ID
```

---

## Meta API Access

The dashboard uses a **Meta System User** (`Kai`, ID: `122098531407285468`) under the Lawn & Land Automation app in the L&L Business Manager.

The system user has access to 35 client ad accounts. Token is stored in:
- **Vercel:** `META_SYSTEM_USER_TOKEN` env var
- **Agent Vault (Kai's Mac):** `meta-system-user-token`

If the token expires or access is lost, regenerate via:  
Meta Business Manager → Business Settings → System Users → Kai → Generate Token

---

## Known Accounts (As of March 2026)

35 accounts total. 6 currently restricted (not managed by L&L — client-owned accounts):
- Premium Landscape Services
- Independent Lawn Service
- From The Ground Up - Landscape
- Outdoor Perfection Landscaping
- B/A Farms
- P&C Solutions

These should be **ignored** via the dashboard UI (🙈 button) so they don't pollute health stats.

---

## Development Notes

- **No dependencies** — zero npm packages in the frontend. `index.html` is self-contained.
- **API response is cached** by Vercel CDN for 5 minutes (`s-maxage=300`).
- **Mixed account data** is fetched at campaign level (not account level) to avoid blending leads and awareness metrics. This adds ~2 API calls per mixed account.
- **Rate limits:** Meta Graph API allows 200 calls/hour per user token. With 35 accounts × ~7 calls each = ~245 calls per full refresh. Watch for rate limit errors if refreshing rapidly.
- **Design system:** L&L Digital UI Standard — `#040a04` background, `#ACE71D` lime accent, Rethink Sans headings, Inter body. See `skills/ll-design-system/` in Kai's workspace.

---

## Roadmap

| Sprint | Status | Description |
|---|---|---|
| v1 | ✅ Live | Core dashboard, health checks, twice-daily crons, ignore list, campaign type detection |
| v2 | Planned | Spend trend sparklines (7-day), per-client budget pacing % |
| v3 | Planned | Weekly performance email digest (Monday 8 AM) |
| v4 | Planned | Account-level notes/labels (e.g. "paused for winter", "new client") |
| Sprint 4 (Quiz) | Planned | Meta Custom Audiences from SAE quiz tags for retargeting |

---

## Maintainer

**Kai** — AI Operations Agent, Lawn & Land Marketing  
Primary contact: Matt Foreman (matt@lawnandlandmarketing.com)  
Internal tool — L&L use only.

*Built March 22–23, 2026.*
