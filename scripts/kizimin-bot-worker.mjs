/**
 * Kizimin read-only background moderation worker for Render Cron Jobs.
 *
 * Required Render environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (secret; Render environment only, never commit)
 * Optional:
 *   BOT_ENABLED=true
 *   BOT_BATCH_LIMIT=100
 *
 * This worker only performs GET requests against Supabase REST. It never deletes,
 * updates, bans, collects IPs, or sends user notifications. Findings go to Render logs.
 */
const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = String(process.env.BOT_ENABLED || "true").toLowerCase() === "true";
const batchLimit = Math.max(10, Math.min(500, Number(process.env.BOT_BATCH_LIMIT) || 100));

if (!enabled) {
  console.log(JSON.stringify({ bot: "kizimin-composite", status: "disabled", at: new Date().toISOString() }));
  process.exit(0);
}
if (!baseUrl || !serviceKey) {
  console.error("Bot configuration error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in Render environment variables.");
  process.exit(1);
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(baseUrl)) {
  console.error("Bot configuration error: SUPABASE_URL must be a valid Supabase project URL.");
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  Accept: "application/json"
};
const now = new Date().toISOString();
const findings = [];
const errors = [];
const counts = { openReports: 0, openInquiries: 0, suspiciousComments: 0, suspiciousArticles: 0 };

async function readTable(table, columns) {
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  url.searchParams.set("select", columns);
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", String(batchLimit));
  const response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 400);
    throw new Error(`${table}: HTTP ${response.status} ${body}`);
  }
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error(`${table}: unexpected response format`);
  return data;
}
function isOpen(status) {
  return ["open", "pending", "new", "reviewing", "未対応", "確認中"].includes(String(status || "").toLowerCase());
}
function spamReason(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const links = (text.match(/https?:\/\//gi) || []).length;
  if (links >= 4) return "URLが4件以上含まれています";
  if (/(.)\1{11,}/u.test(text)) return "同じ文字が過度に連続しています";
  if (/(?:無料で稼げる|必ず儲かる|当選しました|投資で確実|アカウント停止を回避|パスワードを送信)/i.test(text)) return "迷惑投稿で使われやすい表現を検出しました";
  if (text.length > 1800 && links >= 2) return "長文かつ複数URLを含みます";
  return null;
}
function add(level, category, id, summary) {
  findings.push({ level, category, id: String(id ?? ""), summary: String(summary).slice(0, 300) });
}
async function safeScan(table, columns, callback) {
  try { await callback(await readTable(table, columns)); }
  catch (error) { errors.push(error.message); }
}
await Promise.all([
  safeScan("reports", "id,reason,status,created_at", rows => {
    for (const row of rows.filter(r => isOpen(r.status))) {
      counts.openReports++;
      add("high", "report", row.id, `未処理の通報: ${row.reason || "理由未記入"}`);
    }
  }),
  safeScan("inquiries", "id,subject,message,status,created_at", rows => {
    for (const row of rows.filter(r => isOpen(r.status))) {
      counts.openInquiries++;
      add("medium", "inquiry", row.id, `未対応の問い合わせ: ${row.subject || "件名なし"}`);
    }
  }),
  safeScan("comments", "id,content,status,created_at", rows => {
    const seen = new Set();
    for (const row of rows) {
      const text = String(row.content || "");
      const reason = spamReason(text);
      const fingerprint = text.toLowerCase().replace(/\s+/g, " ").trim();
      const repeated = fingerprint.length >= 20 && seen.has(fingerprint);
      if (fingerprint.length >= 20) seen.add(fingerprint);
      if (reason || repeated) {
        counts.suspiciousComments++;
        add("review", "comment", row.id, repeated ? "別のコメントと本文が一致しています" : reason);
      }
    }
  }),
  safeScan("articles", "id,title,excerpt,content,status,created_at", rows => {
    for (const row of rows) {
      const reason = spamReason([row.title, row.excerpt, row.content].filter(Boolean).join("\n"));
      if (reason) {
        counts.suspiciousArticles++;
        add("review", "article", row.id, `${reason}: ${row.title || "タイトルなし"}`);
      }
    }
  })
]);

const result = {
  bot: "kizimin-composite",
  status: errors.length ? "partial" : "ok",
  at: now,
  counts,
  findingCount: findings.length,
  findings: findings.slice(0, 100),
  errors
};
console.log(JSON.stringify(result));
if (errors.length) process.exitCode = 2;
