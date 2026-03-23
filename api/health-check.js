/**
 * L&L Meta Ads — Health Check Endpoint
 * Called by cron twice daily. Returns flagged accounts only.
 * Sends Telegram alert if issues found.
 */

const META_TOKEN = process.env.META_SYSTEM_USER_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BASE = 'https://graph.facebook.com/v21.0';

async function fetchGraph(path, params = {}) {
  const qs = new URLSearchParams({ access_token: META_TOKEN, ...params });
  const res = await fetch(`${BASE}/${path}?${qs}`);
  return res.json();
}

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML',
    }),
  });
}

export default async function handler(req, res) {
  const issues = [];
  const warnings = [];

  try {
    const accountsData = await fetchGraph('me/adaccounts', {
      fields: 'id,name,account_status,disable_reason,funding_source_details',
      limit: 100,
    });
    const accounts = accountsData?.data || [];

    for (const acct of accounts) {
      const acctIssues = [];

      // Account-level status check
      if (acct.account_status !== 1) {
        const statusLabels = { 2: 'DISABLED', 3: 'RESTRICTED', 7: 'PENDING REVIEW' };
        acctIssues.push(`🔴 Account ${statusLabels[acct.account_status] || 'OFFLINE'}`);
      }

      if (acct.account_status === 1) {
        // Payment method check
        if (!acct.funding_source_details?.id) {
          acctIssues.push('💳 No payment method on file');
        }

        // Today's performance check
        try {
          const insights = await fetchGraph(`${acct.id}/insights`, {
            fields: 'spend,actions,cost_per_action_type',
            date_preset: 'today',
          });
          const d = insights?.data?.[0];
          if (d) {
            const spend = parseFloat(d.spend || 0);
            const leads = parseInt(d.actions?.find(a => a.action_type === 'lead')?.value || 0);
            const cpl = parseFloat(d.cost_per_action_type?.find(a => a.action_type === 'lead')?.value || 0);

            // Spent money but zero leads
            if (spend > 15 && leads === 0) {
              acctIssues.push(`⚠️ $${spend.toFixed(0)} spent, 0 leads today`);
            }
            // CPL vs 7d avg
            const ins7 = await fetchGraph(`${acct.id}/insights`, {
              fields: 'spend,actions',
              date_preset: 'last_7d',
            });
            const d7 = ins7?.data?.[0];
            if (d7) {
              const spend7 = parseFloat(d7.spend || 0);
              const leads7 = parseInt(d7.actions?.find(a => a.action_type === 'lead')?.value || 0);
              const avgCpl7 = leads7 > 0 ? spend7 / leads7 : 0;
              if (cpl > 0 && avgCpl7 > 0 && cpl > avgCpl7 * 2.5) {
                acctIssues.push(`📈 CPL spike: $${cpl.toFixed(0)} today vs $${avgCpl7.toFixed(0)} avg (${Math.round(cpl/avgCpl7)}x)`);
              }
            }
          }
        } catch {}

        // Policy violations
        try {
          const ads = await fetchGraph(`${acct.id}/ads`, {
            fields: 'id,name,effective_status',
            filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['DISAPPROVED', 'WITH_ISSUES'] }]),
            limit: 5,
          });
          if (ads?.data?.length > 0) {
            acctIssues.push(`🚫 ${ads.data.length} ad(s) disapproved/with issues`);
          }
        } catch {}
      }

      if (acctIssues.length > 0) {
        if (acct.account_status !== 1) {
          issues.push({ name: acct.name, items: acctIssues });
        } else {
          warnings.push({ name: acct.name, items: acctIssues });
        }
      }
    }

    const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour12: true, hour: 'numeric', minute: '2-digit' });

    if (issues.length === 0 && warnings.length === 0) {
      // All clear — no alert sent
      return res.status(200).json({ status: 'all_clear', checkedAt: new Date().toISOString() });
    }

    // Build alert message
    let msg = `🔍 <b>Meta Ads Health Check</b> — ${now} ET\n`;
    msg += `<i>Checked ${accounts.length} accounts</i>\n\n`;

    if (issues.length > 0) {
      msg += `🔴 <b>CRITICAL (${issues.length} accounts)</b>\n`;
      for (const acct of issues) {
        msg += `\n<b>${acct.name}</b>\n`;
        for (const item of acct.items) msg += `  ${item}\n`;
      }
    }

    if (warnings.length > 0) {
      msg += `\n⚠️ <b>WARNINGS (${warnings.length} accounts)</b>\n`;
      for (const acct of warnings) {
        msg += `\n<b>${acct.name}</b>\n`;
        for (const item of acct.items) msg += `  ${item}\n`;
      }
    }

    msg += `\n👉 <a href="https://meta.groundcontrol.agency">View Dashboard →</a>`;

    await sendTelegram(msg);

    return res.status(200).json({
      status: 'issues_found',
      critical: issues.length,
      warnings: warnings.length,
      issues,
      warnings,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Health check error:', err);
    return res.status(500).json({ error: err.message });
  }
}
