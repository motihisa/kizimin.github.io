/**
 * Kizimin background moderation worker for Render Cron Jobs.
 *
 * Required Render environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SECRET_KEY        (new sb_secret_... key; Render environment only, never commit)
 *   SUPABASE_SERVICE_ROLE_KEY  (temporary legacy fallback during migration)
 * Optional:
 *   BOT_ENABLED=true
 *   BOT_BATCH_LIMIT=100
 *   BOT_AUTO_SUSPEND=false       Must be true in Render AND enabled in admin policy
 *   BOT_SUSPEND_THRESHOLD=3      Suspicious visible posts per user in 24 hours
 *   BOT_SUSPEND_MINUTES=60       Temporary suspension duration (15-1440)
 *
 * Detection runs read-only unless BOT_AUTO_SUSPEND=true AND the saved admin
 * policy mode is auto_suspend. Both gates are required. When enabled, the
 * worker only updates profiles for role=user and account_status=active.
 * It never deletes content, changes admin/moderator accounts, collects IPs,
 * or overrides an existing ban/suspension.
 */
const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = String(process.env.BOT_ENABLED || "true").toLowerCase() === "true";
const envAllowsAutoSuspend = String(process.env.BOT_AUTO_SUSPEND || "false").toLowerCase() === "true";
let autoSuspend = false; // Both Render environment and saved admin policy must enable it.
const batchLimit = Math.max(10, Math.min(500, Number(process.env.BOT_BATCH_LIMIT) || 100));
let suspendThreshold = Math.max(2, Math.min(10, Number(process.env.BOT_SUSPEND_THRESHOLD) || 3));
let suspendMinutes = Math.max(15, Math.min(1440, Number(process.env.BOT_SUSPEND_MINUTES) || 60));
let urlThreshold = 4;
let repeatCharThreshold = 12;
let maxSuspensionsPerRun = 3;
let windowHours = 24;
const nowDate = new Date();
const now = nowDate.toISOString();
let windowStart = new Date(nowDate.getTime() - windowHours * 60 * 60 * 1000).toISOString();

if (!enabled) {
  console.log(JSON.stringify({ bot: "kizimin-composite", status: "disabled", at: now }));
  process.exit(0);
}
if (!baseUrl || !serviceKey) {
  console.error("Bot configuration error: SUPABASE_URL and SUPABASE_SECRET_KEY (or temporary legacy SUPABASE_SERVICE_ROLE_KEY) must be configured in Render environment variables.");
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
try {
  const settingsUrl = new URL(`${baseUrl}/rest/v1/kizimin_bot_settings`);
  settingsUrl.searchParams.set("select", "settings");
  settingsUrl.searchParams.set("id", "eq.true");
  settingsUrl.searchParams.set("limit", "1");
  const settingsResponse = await fetch(settingsUrl, { headers, signal: AbortSignal.timeout(15000) });
  if (!settingsResponse.ok) throw new Error(`HTTP ${settingsResponse.status}`);
  const rows = await settingsResponse.json();
  const settings = rows?.[0]?.settings || {};
  autoSuspend = envAllowsAutoSuspend && settings.mode === "auto_suspend";
  suspendThreshold = Math.max(2, Math.min(10, Number(settings.threshold) || 3));
  suspendMinutes = Math.max(15, Math.min(1440, Number(settings.suspend_minutes) || 60));
  urlThreshold = Math.max(2, Math.min(6, Number(settings.url_threshold) || 4));
  repeatCharThreshold = Math.max(8, Math.min(30, Number(settings.repeat_char_threshold) || 12));
  maxSuspensionsPerRun = Math.max(1, Math.min(10, Number(settings.max_suspensions_per_run) || 3));
  windowHours = Math.max(1, Math.min(168, Number(settings.window_hours) || 24));
} catch (error) {
  // If policy retrieval fails, remain in detect-only mode.
  autoSuspend = false;
  errors.push(`Bot設定を読み込めないため検知のみで実行: ${error.message}`);
}
windowStart = new Date(nowDate.getTime() - windowHours * 60 * 60 * 1000).toISOString();
const counts = {
  openReports: 0,
  openInquiries: 0,
  suspiciousComments: 0,
  suspiciousArticles: 0,
  suspensionCandidates: 0,
  suspendedUsers: 0,
  staleReports: 0,
  staleInquiries: 0,
  newAccountsLastHour: 0,
  highActivityAuthors: 0,
  repeatedUrls: 0
};
const suspiciousByAuthor = new Map();
const activityByAuthor = new Map();
const urlAuthors = new Map();
const oneHourAgo = Date.now() - 60 * 60 * 1000;
function trackActivity(authorId, createdAt, category) {
  if (!authorId || !createdAt || new Date(createdAt).getTime() < oneHourAgo) return;
  const id = String(authorId);
  const entry = activityByAuthor.get(id) || { count: 0, categories: new Set() };
  entry.count++;
  entry.categories.add(category);
  activityByAuthor.set(id, entry);
}
function trackUrls(authorId, value) {
  if (!authorId) return;
  const matches = String(value || "").match(/https?:\/\/[^\s<>"']+/gi) || [];
  for (const raw of matches) {
    try {
      const parsed = new URL(raw);
      const key = parsed.hostname.toLowerCase() + parsed.pathname.replace(/\/$/, "");
      const authors = urlAuthors.get(key) || new Set();
      authors.add(String(authorId));
      urlAuthors.set(key, authors);
    } catch { /* Ignore malformed URLs. */ }
  }
}

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
  if (links >= urlThreshold) return `URLが${urlThreshold}件以上含まれています`;
  const chars = Array.from(text);
  const hasLongRepeat = chars.some((char, index) =>
    index >= repeatCharThreshold - 1 &&
    chars.slice(index - repeatCharThreshold + 1, index + 1).every(value => value === char)
  );
  if (hasLongRepeat) return "同じ文字が過度に連続しています";
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
  for (const [userId, entry] of candidates.slice(0, maxSuspensionsPerRun)) {
    if (counts.suspendedUsers >= maxSuspensionsPerRun) break;
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
          ban_reason: `自動モデレーション: 過去${windowHours}時間以内に不審な投稿を${entry.ids.length}件検知`,
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
      if (row.created_at && Date.now() - new Date(row.created_at).getTime() > 48 * 60 * 60 * 1000) {
        counts.staleReports++;
        add("high", "stale-report", row.id, `48時間以上未対応の通報: ${row.reason || "理由未記入"}`);
      }
      add("high", "report", row.id, `未処理の通報: ${row.reason || "理由未記入"}`);
    }
  }),
  safeScan("inquiries", "id,subject,message,status,created_at", rows => {
    for (const row of rows.filter(r => isOpen(r.status))) {
      counts.openInquiries++;
      if (row.created_at && Date.now() - new Date(row.created_at).getTime() > 48 * 60 * 60 * 1000) {
        counts.staleInquiries++;
        add("medium", "stale-inquiry", row.id, `48時間以上未対応の問い合わせ: ${row.subject || "件名なし"}`);
      }
      add("medium", "inquiry", row.id, `未対応の問い合わせ: ${row.subject || "件名なし"}`);
    }
  }),
  safeScan("comments", "id,author_id,content,status,created_at", rows => {
    const seen = new Set();
    for (const row of rows) {
      if (row.status !== "visible" || !row.created_at || row.created_at < windowStart) continue;
      trackActivity(row.author_id, row.created_at, "comment");
      trackUrls(row.author_id, row.content);
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
      if (row.status !== "visible" || !row.created_at || row.created_at < windowStart) continue;
      trackActivity(row.author_id, row.created_at, "article");
      trackUrls(row.author_id, [row.title, row.excerpt, row.content].filter(Boolean).join("\n"));
      const reason = spamReason([row.title, row.excerpt, row.content].filter(Boolean).join("\n"));
      if (reason) {
        counts.suspiciousArticles++;
        noteSuspicious(row.author_id, "article", row.id, `${reason}: ${row.title || "タイトルなし"}`);
      }
    }
  }, { created_at: `gte.${windowStart}`, status: "eq.visible" })
]);

// Read-only operational signals: no automatic punishment is based on these checks.
for (const [authorId, entry] of activityByAuthor.entries()) {
  if (entry.count >= 8) {
    counts.highActivityAuthors++;
    add("review", "posting-burst", authorId,
      `過去1時間に${entry.count}件の投稿（${[...entry.categories].join("/")})。正規の活動か確認してください。`);
  }
}
for (const [url, authors] of urlAuthors.entries()) {
  if (authors.size >= 3) {
    counts.repeatedUrls++;
    add("review", "shared-url", url,
      `同じURLが${authors.size}アカウントの投稿で確認されました。`);
  }
}
try {
  const recentProfiles = await readTable("profiles", "id,created_at", {
    created_at: `gte.${new Date(Date.now() - 60 * 60 * 1000).toISOString()}`
  });
  counts.newAccountsLastHour = recentProfiles.length;
  if (recentProfiles.length >= 5) {
    add("review", "signup-burst", "profiles",
      `過去1時間に${recentProfiles.length}件の新規登録がありました。正規の利用増加か確認してください。`);
  }
} catch (error) {
  errors.push(`アカウント監視: ${error.message}`);
}
await suspendEligibleUsers();
const result = {
  bot: "kizimin-composite",
  status: errors.length ? "partial" : "ok",
  at: now,
  autoSuspend,
  policy: { mode: autoSuspend ? "auto_suspend" : "detect_only", threshold: suspendThreshold, windowHours, suspensionMinutes: suspendMinutes, urlThreshold, repeatCharThreshold, maxSuspensionsPerRun },
  counts,
  findingCount: findings.length,
  findings: findings.slice(0, 100),
  errors
};
console.log(JSON.stringify(result));
if (errors.length) process.exitCode = 2;
