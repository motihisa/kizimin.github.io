/**
 * Kizimin background moderation worker for Render Cron Jobs.
 *
 * Required Render environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (secret; Render environment only, never commit)
 * Optional:
 *   BOT_ENABLED=true
 *   BOT_BATCH_LIMIT=100
 *   BOT_AUTO_SUSPEND=false       Must be explicitly enabled in Render
 *   BOT_SUSPEND_THRESHOLD=3      Suspicious visible posts per user in 24 hours
 *   BOT_SUSPEND_MINUTES=60       Temporary suspension duration (15-1440)
 *
 * Detection runs read-only unless BOT_AUTO_SUSPEND=true. When enabled, the
 * worker only updates profiles for role=user and account_status=active.
 * It never deletes content, changes admin/moderator accounts, collects IPs,
 * or overrides an existing ban/suspension.
 */
const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = String(process.env.BOT_ENABLED || "true").toLowerCase() === "true";
let autoSuspend = false; // Enabled only by the admin-saved Supabase policy.
const batchLimit = Math.max(10, Math.min(500, Number(process.env.BOT_BATCH_LIMIT) || 100));
let suspendThreshold = Math.max(2, Math.min(10, Number(process.env.BOT_SUSPEND_THRESHOLD) || 3));
let suspendMinutes = Math.max(15, Math.min(1440, Number(process.env.BOT_SUSPEND_MINUTES) || 60));
let windowHours = 24;
const nowDate = new Date();
const now = nowDate.toISOString();
let windowStart = new Date(nowDate.getTime() - windowHours * 60 * 60 * 1000).toISOString();

if (!enabled) {
  console.log(JSON.stringify({ bot: "kizimin-composite", status: "disabled", at: now }));
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
const findings = [];
const errors = [];
const counts = {
  openReports: 0,
  openInquiries: 0,
  suspiciousComments: 0,
  suspiciousArticles: 0,
  suspensionCandidates: 0,
  suspendedUsers: 0
};
const suspiciousByAuthor = new Map();

async function readTable(table, columns, filters = {}) {
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  url.searchParams.set("select", columns);
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", String(batchLimit));
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);
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
function noteSuspicious(authorId, category, id, reason) {
  if (!authorId) return;
  const entry = suspiciousByAuthor.get(String(authorId)) || { ids: [], categories: new Set() };
  entry.ids.push(String(id));
  entry.categories.add(category);
  suspiciousByAuthor.set(String(authorId), entry);
  add("review", category, id, reason);
}
async function safeScan(table, columns, callback, filters = {}) {
  try { await callback(await readTable(table, columns, filters)); }
  catch (error) { errors.push(error.message); }
}
async function suspendEligibleUsers() {
  if (!autoSuspend) return;
  const candidates = [...suspiciousByAuthor.entries()]
    .filter(([, entry]) => entry.ids.length >= suspendThreshold);
  counts.suspensionCandidates = candidates.length;
  for (const [userId, entry] of candidates) {
    try {
      const url = new URL(`${baseUrl}/rest/v1/profiles`);
      url.searchParams.set("id", `eq.${userId}`);
      url.searchParams.set("role", "eq.user");
      url.searchParams.set("account_status", "eq.active");
      const expiresAt = new Date(Date.now() + suspendMinutes * 60 * 1000).toISOString();
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          account_status: "suspended",
          ban_reason: `自動モデレーション: 24時間以内に不審な投稿を${entry.ids.length}件検知`,
          ban_expires_at: expiresAt,
          updated_at: now
        }),
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) {
        const body = (await response.text()).slice(0, 400);
        errors.push(`profile suspension failed for ${userId}: HTTP ${response.status} ${body}`);
        continue;
      }
      const updated = await response.json();
      if (Array.isArray(updated) && updated.length === 1) {
        counts.suspendedUsers++;
        add("high", "auto-suspension", userId,
          `自動一時停止: ${suspendMinutes}分、検知投稿${entry.ids.length}件（${[...entry.categories].join("/")})`);
      }
      // No returned row means the profile was not an active ordinary user;
      // leave existing status and privileged accounts untouched.
    } catch (error) {
      errors.push(`profile suspension failed for ${userId}: ${error.message}`);
    }
  }
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
  safeScan("comments", "id,author_id,content,status,created_at", rows => {
    const seen = new Set();
    for (const row of rows) {
      if (row.status !== "visible" || !row.created_at || row.created_at < windowStart) continue;
      const text = String(row.content || "");
      const reason = spamReason(text);
      const fingerprint = text.toLowerCase().replace(/\s+/g, " ").trim();
      const repeated = fingerprint.length >= 20 && seen.has(fingerprint);
      if (fingerprint.length >= 20) seen.add(fingerprint);
      if (reason || repeated) {
        counts.suspiciousComments++;
        noteSuspicious(row.author_id, "comment", row.id,
          repeated ? "別のコメントと本文が一致しています" : reason);
      }
    }
  }, { created_at: `gte.${windowStart}`, status: "eq.visible" }),
  safeScan("articles", "id,author_id,title,excerpt,content,status,created_at", rows => {
    for (const row of rows) {
      if (!row.created_at || row.created_at < windowStart) continue;
      const reason = spamReason([row.title, row.excerpt, row.content].filter(Boolean).join("\n"));
      if (reason) {
        counts.suspiciousArticles++;
        noteSuspicious(row.author_id, "article", row.id, `${reason}: ${row.title || "タイトルなし"}`);
      }
    }
  }, { created_at: `gte.${windowStart}` })
]);

await suspendEligibleUsers();
const result = {
  bot: "kizimin-composite",
  status: errors.length ? "partial" : "ok",
  at: now,
  autoSuspend,
  policy: { threshold: suspendThreshold, windowHours: 24, suspensionMinutes: suspendMinutes },
  counts,
  findingCount: findings.length,
  findings: findings.slice(0, 100),
  errors
};
console.log(JSON.stringify(result));
if (errors.length) process.exitCode = 2;
