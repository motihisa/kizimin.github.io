/**
 * Kizimin AI + MCP gateway.
 *
 * Secrets are configured in Cloudflare Worker settings, never in this repository:
 *   AI (Cloudflare Workers AI binding)
 * Public configuration:
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 *
 * This Worker always uses the caller's Supabase access token for database access.
 * It never uses a Supabase service-role key, so RLS remains the authority.
 */
const SITE_ORIGIN = "https://motihisa.github.io";
const SUPABASE_DEFAULT_URL = "https://bimddapbkdakspjaemsm.supabase.co";
const MCP_PATH = "/mcp";
const MCP_VERSION = "2025-06-18";
const ALLOWED_ORIGINS = new Set([SITE_ORIGIN, "http://localhost:5500", "http://127.0.0.1:5500"]);
// Best-effort per-isolate cap. Add a Cloudflare Rate Limiting binding for a hard edge limit.
const CHAT_REQUESTS = new Map();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : SITE_ORIGIN;
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, accept",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
}

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function supabaseUrl(env) {
  return (env.SUPABASE_URL || SUPABASE_DEFAULT_URL).replace(/\/$/, "");
}

function bearer(request) {
  const value = request.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

async function getUserContext(request, env) {
  const token = bearer(request);
  if (!token) return { error: "ログインが必要です。", status: 401 };
  const base = supabaseUrl(env);
  const key = env.SUPABASE_ANON_KEY;
  if (!key) return { error: "サーバー設定が不足しています（SUPABASE_ANON_KEY）。", status: 503 };

  const authResponse = await fetch(base + "/auth/v1/user", {
    headers: { apikey: key, authorization: "Bearer " + token }
  });
  if (!authResponse.ok) return { error: "ログイン状態を確認できません。再ログインしてください。", status: 401 };
  const user = await authResponse.json();
  if (!user?.id) return { error: "ログイン状態を確認できません。", status: 401 };

  const profileResponse = await fetch(
    base + "/rest/v1/profiles?id=eq." + encodeURIComponent(user.id) + "&select=id,role,account_status",
    { headers: { apikey: key, authorization: "Bearer " + token } }
  );
  if (!profileResponse.ok) return { error: "アカウントの利用状態を確認できません。", status: 403 };
  const profiles = await profileResponse.json();
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile) return { error: "アカウント情報が見つかりません。", status: 403 };
  if (String(profile.account_status || "").toLowerCase() !== "active") {
    return { error: "このアカウントではAI連携を利用できません。", status: 403 };
  }
  return { token, user, profile, base, key };
}

async function dbRequest(ctx, path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("apikey", ctx.key);
  headers.set("authorization", "Bearer " + ctx.token);
  headers.set("accept", "application/json");
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return fetch(ctx.base + "/rest/v1/" + path, { ...options, headers });
}

async function requireAdmin(ctx) {
  return String(ctx.profile?.role || "").toLowerCase() === "admin";
}

function slugify(title) {
  const base = String(title || "").normalize("NFKD").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "article";
  return base + "-" + Date.now().toString(36);
}

function mcpResult(id, value, isError = false) {
  return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }], ...(isError ? { isError: true } : {}) } };
}
function mcpError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

const TOOLS = [
  { name: "search_public_articles", description: "Kiziminの公開済み公開記事を検索する。記事本文の検索結果は最大10件。", inputSchema: { type: "object", properties: { query: { type: "string", description: "検索語" } }, required: ["query"], additionalProperties: false } },
  { name: "get_my_articles", description: "ログイン中のユーザー自身の記事一覧を取得する。", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false } },
  { name: "create_article", description: "記事を作成・公開する。既存のRLS権限を適用する。公開範囲は公開または許可ユーザー限定。", inputSchema: { type: "object", properties: { title: { type: "string", minLength: 1, maxLength: 160 }, content: { type: "string", minLength: 1, maxLength: 30000 }, excerpt: { type: "string", maxLength: 1000 }, category_id: { type: "string", description: "KiziminカテゴリのUUID" }, visibility: { type: "string", enum: ["public", "restricted"] }, allowed_user_ids: { type: "array", items: { type: "string" }, maxItems: 100 } }, required: ["title", "content", "category_id"], additionalProperties: false } },
  { name: "update_my_article", description: "自分が所有する記事のタイトル・概要・本文を更新する。", inputSchema: { type: "object", properties: { article_id: { type: "string" }, title: { type: "string", maxLength: 160 }, excerpt: { type: "string", maxLength: 1000 }, content: { type: "string", maxLength: 30000 } }, required: ["article_id"], additionalProperties: false } },
  { name: "admin_overview", description: "管理者専用。ユーザー・記事・通報・問い合わせの件数を取得する。", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "admin_list_users", description: "管理者専用。ユーザー管理用の限定されたプロフィール一覧を取得する。", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: "admin_list_reports", description: "管理者専用。通報一覧を取得する。", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: "admin_list_articles", description: "管理者専用。記事の管理一覧を取得する。", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: "admin_update_article_status", description: "管理者専用。記事を下書き・公開・アーカイブに切り替える。実行には confirm='UPDATE_ARTICLE_STATUS' が必須。", inputSchema: { type: "object", properties: { article_id: { type: "string" }, status: { type: "string", enum: ["draft", "published", "archived"] }, confirm: { type: "string", enum: ["UPDATE_ARTICLE_STATUS"] } }, required: ["article_id", "status", "confirm"], additionalProperties: false } },
  { name: "admin_list_inquiries", description: "管理者専用。問い合わせ一覧を取得する。", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: "admin_update_inquiry", description: "管理者専用。問い合わせの状態や管理メモを更新する。実行には confirm='UPDATE_INQUIRY' が必須。", inputSchema: { type: "object", properties: { inquiry_id: { type: "string" }, status: { type: "string", enum: ["open", "reviewing", "resolved", "closed"] }, admin_note: { type: "string", maxLength: 2000 }, confirm: { type: "string", enum: ["UPDATE_INQUIRY"] } }, required: ["inquiry_id", "status", "confirm"], additionalProperties: false } },
  { name: "admin_set_maintenance_mode", description: "管理者専用。メンテナンスモードを切り替える。一般ユーザーがサイトを使えなくなるため、confirm='ENABLE_MAINTENANCE' または 'DISABLE_MAINTENANCE' が必須。", inputSchema: { type: "object", properties: { enabled: { type: "boolean" }, confirm: { type: "string", enum: ["ENABLE_MAINTENANCE", "DISABLE_MAINTENANCE"] } }, required: ["enabled", "confirm"], additionalProperties: false } },
  { name: "admin_update_report", description: "管理者専用。通報ステータスを更新する。実行には confirm='UPDATE_REPORT' が必須。", inputSchema: { type: "object", properties: { report_id: { type: "string" }, status: { type: "string", enum: ["open", "resolved", "dismissed"] }, admin_note: { type: "string", maxLength: 2000 }, confirm: { type: "string", enum: ["UPDATE_REPORT"] } }, required: ["report_id", "status", "confirm"], additionalProperties: false } },
  { name: "admin_set_account_status", description: "管理者専用。別ユーザーのアカウント状態を active/banned/suspended に変更する。実行には confirm='CHANGE_ACCOUNT_STATUS' が必須。IP BANには対応しない。", inputSchema: { type: "object", properties: { user_id: { type: "string" }, account_status: { type: "string", enum: ["active", "banned", "suspended"] }, ban_reason: { type: "string", maxLength: 1000 }, confirm: { type: "string", enum: ["CHANGE_ACCOUNT_STATUS"] } }, required: ["user_id", "account_status", "confirm"], additionalProperties: false } }
];

async function callTool(name, args, ctx) {
  const adminTools = new Set(["admin_overview", "admin_list_users", "admin_list_reports", "admin_update_report", "admin_set_account_status", "admin_list_articles", "admin_update_article_status", "admin_list_inquiries", "admin_update_inquiry", "admin_set_maintenance_mode"]);
  if (adminTools.has(name) && !(await requireAdmin(ctx))) throw new Error("この操作は管理者専用です。");
  if (name === "search_public_articles") {
    const q = String(args.query || "").trim().toLocaleLowerCase("ja-JP");
    if (!q) throw new Error("検索語を入力してください。");
    const r = await dbRequest(ctx, "articles?select=id,title,excerpt,published_at,category_id&status=eq.published&visibility=eq.public&order=published_at.desc&limit=100");
    if (!r.ok) throw new Error("公開記事を検索できませんでした。");
    const rows = await r.json();
    return rows.filter(a => (a.title + " " + (a.excerpt || "")).toLocaleLowerCase("ja-JP").includes(q)).slice(0, 10);
  }
  if (name === "get_my_articles") {
    const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
    const r = await dbRequest(ctx, "articles?select=id,title,excerpt,status,visibility,created_at,updated_at&author_id=eq." + encodeURIComponent(ctx.user.id) + "&order=updated_at.desc&limit=" + limit);
    if (!r.ok) throw new Error("自分の記事一覧を取得できませんでした。");
    return await r.json();
  }
  if (name === "create_article") {
    const title = String(args.title || "").trim();
    const content = String(args.content || "").trim();
    const categoryId = String(args.category_id || "");
    const visibility = args.visibility === "restricted" ? "restricted" : "public";
    if (!title || !content || !categoryId) throw new Error("タイトル・本文・カテゴリは必須です。");
    if (content.length > 30000) throw new Error("本文は30,000文字以内にしてください。");
    const article = { author_id: ctx.user.id, category_id: categoryId, title, slug: slugify(title), excerpt: String(args.excerpt || "").slice(0, 1000) || null, content, status: "published", visibility, published_at: new Date().toISOString() };
    const r = await dbRequest(ctx, "articles?select=id,title,status,visibility", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify(article) });
    if (!r.ok) throw new Error("記事を作成できませんでした。Supabaseの権限またはカテゴリを確認してください。");
    const created = (await r.json())[0];
    if (visibility === "restricted") {
      const ids = [...new Set((Array.isArray(args.allowed_user_ids) ? args.allowed_user_ids : []).map(String).filter(id => id && id !== ctx.user.id))];
      if (!ids.length) return { article: created, warning: "記事は作成されましたが、許可ユーザーが指定されていません。" };
      const ar = await dbRequest(ctx, "article_allowed_users", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify(ids.map(user_id => ({ article_id: created.id, user_id }))) });
      if (!ar.ok) return { article: created, warning: "記事は作成されましたが、閲覧許可ユーザーの登録に失敗しました。記事の公開範囲を確認してください。" };
    }
    return created;
  }
  if (name === "update_my_article") {
    const id = String(args.article_id || "");
    const check = await dbRequest(ctx, "articles?select=id,author_id&id=eq." + encodeURIComponent(id) + "&limit=1");
    if (!check.ok) throw new Error("記事を確認できませんでした。");
    const found = (await check.json())[0];
    if (!found || found.author_id !== ctx.user.id) throw new Error("自分が所有する記事だけ更新できます。");
    const patch = {};
    if (args.title !== undefined) patch.title = String(args.title).trim().slice(0, 160);
    if (args.excerpt !== undefined) patch.excerpt = String(args.excerpt).slice(0, 1000);
    if (args.content !== undefined) patch.content = String(args.content).slice(0, 30000);
    if (!Object.keys(patch).length) throw new Error("更新する項目を指定してください。");
    const r = await dbRequest(ctx, "articles?id=eq." + encodeURIComponent(id) + "&author_id=eq." + encodeURIComponent(ctx.user.id), { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify(patch) });
    if (!r.ok) throw new Error("記事を更新できませんでした。");
    return await r.json();
  }
  if (name === "admin_overview") {
    const tables = ["profiles", "articles", "reports", "inquiries"];
    const counts = {};
    for (const table of tables) {
      const r = await dbRequest(ctx, table + "?select=*",
        { method: "HEAD", headers: { prefer: "count=exact" } });
      if (!r.ok) counts[table] = "取得不可（RLSまたは権限を確認）";
      else {
        const range = r.headers.get("content-range") || "";
        counts[table] = range.includes("/") ? Number(range.split("/").pop()) : null;
      }
    }
    return counts;
  }
  if (name === "admin_list_users") {
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 50));
    const r = await dbRequest(ctx, "profiles?select=id,username,display_name,role,account_status,ban_reason,ban_expires_at,created_at&order=created_at.desc&limit=" + limit);
    if (!r.ok) throw new Error("ユーザー一覧を取得できませんでした。");
    return await r.json();
  }
  if (name === "admin_list_reports") {
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 50));
    const r = await dbRequest(ctx, "reports?select=id,article_id,comment_id,reason,status,admin_note,created_at,resolved_at&order=created_at.desc&limit=" + limit);
    if (!r.ok) throw new Error("通報一覧を取得できませんでした。");
    return await r.json();
  }
  if (name === "admin_list_articles") {
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 50));
    const r = await dbRequest(ctx, "articles?select=id,title,status,visibility,author_id,created_at,is_pinned&order=created_at.desc&limit=" + limit);
    if (!r.ok) throw new Error("記事一覧を取得できませんでした。");
    return await r.json();
  }
  if (name === "admin_update_article_status") {
    if (args.confirm !== "UPDATE_ARTICLE_STATUS") throw new Error("確認文字列が一致しません。変更を中止しました。");
    const r = await dbRequest(ctx, "articles?id=eq." + encodeURIComponent(String(args.article_id)) + "&select=id,title,status", { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ status: args.status }) });
    if (!r.ok) throw new Error("記事状態を更新できませんでした。");
    return await r.json();
  }
  if (name === "admin_list_inquiries") {
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 50));
    const r = await dbRequest(ctx, "inquiries?select=id,subject,message,status,admin_note,created_at,resolved_at&order=created_at.desc&limit=" + limit);
    if (!r.ok) throw new Error("問い合わせ一覧を取得できませんでした。");
    return await r.json();
  }
  if (name === "admin_update_inquiry") {
    if (args.confirm !== "UPDATE_INQUIRY") throw new Error("確認文字列が一致しません。変更を中止しました。");
    const patch = { status: args.status, admin_note: String(args.admin_note || "").slice(0, 2000) };
    patch.resolved_at = ["resolved", "closed"].includes(args.status) ? new Date().toISOString() : null;
    const r = await dbRequest(ctx, "inquiries?id=eq." + encodeURIComponent(String(args.inquiry_id)) + "&select=id,subject,status,admin_note,resolved_at", { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify(patch) });
    if (!r.ok) throw new Error("問い合わせを更新できませんでした。");
    return await r.json();
  }
  if (name === "admin_set_maintenance_mode") {
    const expected = args.enabled ? "ENABLE_MAINTENANCE" : "DISABLE_MAINTENANCE";
    if (args.confirm !== expected) throw new Error("確認文字列が一致しません。変更を中止しました。");
    const r = await dbRequest(ctx, "rpc/admin_set_maintenance_mode", { method: "POST", body: JSON.stringify({ p_enabled: !!args.enabled }) });
    if (!r.ok) throw new Error("メンテナンス設定を更新できませんでした。既存の管理者チェックが拒否した可能性があります。");
    return await r.json();
  }
  if (name === "admin_update_report") {
    if (args.confirm !== "UPDATE_REPORT") throw new Error("確認文字列が一致しません。変更を中止しました。");
    const patch = { status: args.status };
    if (args.admin_note !== undefined) patch.admin_note = String(args.admin_note).slice(0, 2000);
    if (args.status === "resolved" || args.status === "dismissed") patch.resolved_at = new Date().toISOString();
    const r = await dbRequest(ctx, "reports?id=eq." + encodeURIComponent(String(args.report_id)) + "&select=id,status,admin_note,resolved_at", { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify(patch) });
    if (!r.ok) throw new Error("通報を更新できませんでした。");
    return await r.json();
  }
  if (name === "admin_set_account_status") {
    if (args.confirm !== "CHANGE_ACCOUNT_STATUS") throw new Error("確認文字列が一致しません。変更を中止しました。");
    if (String(args.user_id) === ctx.user.id) throw new Error("自分自身のアカウント状態はこのツールから変更できません。");
    const patch = { account_status: args.account_status };
    if (args.account_status === "banned" || args.account_status === "suspended") {
      patch.ban_reason = String(args.ban_reason || "管理者による措置").slice(0, 1000);
    } else {
      patch.ban_reason = null;
      patch.ban_expires_at = null;
    }
    const r = await dbRequest(ctx, "profiles?id=eq." + encodeURIComponent(String(args.user_id)) + "&select=id,username,account_status,ban_reason,ban_expires_at", { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify(patch) });
    if (!r.ok) throw new Error("アカウント状態を更新できませんでした。Supabaseの既存権限ポリシーを確認してください。");
    return await r.json();
  }
  throw new Error("未対応のツールです。");
}

async function handleMcp(request, env) {
  const origin = request.headers.get("origin") || "";
  const url = new URL(request.url);
  const metadata = {
    resource: url.origin + MCP_PATH,
    authorization_servers: [supabaseUrl(env) + "/auth/v1"],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "email", "profile"]
  };
  if (url.pathname === "/.well-known/oauth-protected-resource" || url.pathname === "/.well-known/oauth-protected-resource/mcp") {
    return withCors(json(metadata), origin);
  }
  if (request.method !== "POST") {
    return withCors(json({ error: "POSTでMCPリクエストを送信してください。" }, 405, { allow: "POST, OPTIONS" }), origin);
  }
  const ctx = await getUserContext(request, env);
  if (ctx.error) {
    return withCors(json({ error: ctx.error }, ctx.status, {
      "www-authenticate": 'Bearer resource_metadata="' + url.origin + "/.well-known/oauth-protected-resource" + '"'
    }), origin);
  }
  let body;
  try { body = await request.json(); } catch { return withCors(json(mcpError(null, -32700, "Invalid JSON")), origin); }
  const id = body?.id ?? null;
  if (body?.jsonrpc !== "2.0" || typeof body.method !== "string") return withCors(json(mcpError(id, -32600, "Invalid Request")), origin);
  if (body.method === "notifications/initialized" || body.method.startsWith("notifications/")) {
    return withCors(new Response(null, { status: 202 }), origin);
  }
  if (body.method === "initialize") {
    return withCors(json({ jsonrpc: "2.0", id, result: { protocolVersion: MCP_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "kizimin", version: "1.0.0" } } }), origin);
  }
  if (body.method === "ping") return withCors(json({ jsonrpc: "2.0", id, result: {} }), origin);
  if (body.method === "tools/list") return withCors(json({ jsonrpc: "2.0", id, result: { tools: TOOLS } }), origin);
  if (body.method === "tools/call") {
    const name = body.params?.name;
    const args = body.params?.arguments || {};
    try {
      const value = await callTool(name, args, ctx);
      return withCors(json(mcpResult(id, value)), origin);
    } catch (error) {
      return withCors(json(mcpResult(id, String(error?.message || "ツールの実行に失敗しました。"), true)), origin);
    }
  }
  return withCors(json(mcpError(id, -32601, "Method not found")), origin);
}

async function handleChat(request, env) {
  const ctx = await getUserContext(request, env);
  if (ctx.error) return json({ error: ctx.error }, ctx.status);
  if (!env.AI || typeof env.AI.run !== "function") return json({ error: "Cloudflare Workers AIが未設定です。管理者がWorkerのAI bindingを確認してください。" }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "リクエスト形式が正しくありません。" }, 400); }
  const prompt = String(body?.prompt || "").trim();
  const context = String(body?.context || "").trim();
  if (!prompt) return json({ error: "質問を入力してください。" }, 400);
  if (prompt.length > 5000 || context.length > 12000) return json({ error: "質問は5,000文字以内、参照文章は12,000文字以内にしてください。" }, 413);
  const now = Date.now();
  const recent = (CHAT_REQUESTS.get(ctx.user.id) || []).filter(ts => now - ts < 60_000);
  if (recent.length >= 8) return json({ error: "AIの利用が短時間に集中しています。1分ほど待ってからお試しください。" }, 429);
  recent.push(now);
  CHAT_REQUESTS.set(ctx.user.id, recent);
  if (CHAT_REQUESTS.size > 5000) {
    for (const [userId, stamps] of CHAT_REQUESTS) {
      if (!stamps.some(ts => now - ts < 60_000)) CHAT_REQUESTS.delete(userId);
      if (CHAT_REQUESTS.size <= 4000) break;
    }
  }

  const systemPrompt = "あなたはKiziminの日本語記事作成アシスタントです。記事の要約、校正、タイトル案、構成案を支援します。断定できない情報は断定せず、ユーザーの文章を勝手に公開・保存したと主張しません。管理者権限、秘密情報、他人の非公開データを要求・開示しません。簡潔で実用的に回答します。";
  const userPrompt = (context ? "参考文章（ユーザーが入力した内容）:\n" + context + "\n\n" : "") + prompt;
  // Reserve a conservative estimate before invoking the model. The final charge uses
  // the Neurons value returned by Workers AI when available.
  const estimatedTokens = Math.ceil((systemPrompt.length + userPrompt.length) * 0.8) + 800;
  const estimatedNeurons = Math.max(0.1, Math.ceil(estimatedTokens * 0.02 * 100) / 100);

  let reserveResponse;
  try {
    reserveResponse = await fetch(ctx.base + "/rest/v1/rpc/reserve_ai_budget", {
      method: "POST",
      headers: {
        apikey: ctx.key,
        authorization: "Bearer " + ctx.token,
        "content-type": "application/json"
      },
      body: JSON.stringify({ p_estimated_neurons: estimatedNeurons })
    });
  } catch (error) {
    console.error("AI budget reservation failed", String(error?.message || error));
    return json({ error: "AI利用量を確認できません。少し待ってから再試行してください。" }, 503);
  }
  if (!reserveResponse.ok) {
    console.error("AI budget reservation failed", reserveResponse.status, (await reserveResponse.text()).slice(0, 300));
    return json({ error: "AI利用量の確認に失敗しました。管理者が設定を確認してください。" }, 503);
  }

  let usage;
  try { usage = await reserveResponse.json(); } catch { usage = null; }
  if (!usage?.allowed) {
    if (usage?.reason === "user_neuron_limit") {
      return json({ error: "本日のAI計算量の上限に達しました。日本時間の午前9時以降に再度お試しください。", usage }, 429);
    }
    if (usage?.reason === "global_neuron_limit") {
      return json({ error: "Kizimin全体の本日のAI利用枠に達しました。日本時間の午前9時以降に再度お試しください。", usage }, 429);
    }
    return json({ error: "AI利用量を確認できません。再ログインしてお試しください。" }, 401);
  }

  async function finishBudget(actualNeurons, succeeded) {
    try {
      const finishResponse = await fetch(ctx.base + "/rest/v1/rpc/finish_ai_budget", {
        method: "POST",
        headers: {
          apikey: ctx.key,
          authorization: "Bearer " + ctx.token,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          p_event_id: usage.event_id,
          p_actual_neurons: actualNeurons,
          p_succeeded: succeeded
        })
      });
      if (!finishResponse.ok) {
        console.error("AI budget finalization failed", finishResponse.status, (await finishResponse.text()).slice(0, 300));
        return usage;
      }
      const { data: statusData, error: statusError } = await (async () => {
        const statusResponse = await fetch(ctx.base + "/rest/v1/rpc/get_ai_usage_status", {
          method: "POST",
          headers: {
            apikey: ctx.key,
            authorization: "Bearer " + ctx.token,
            "content-type": "application/json"
          },
          body: "{}"
        });
        if (!statusResponse.ok) return { data: null, error: true };
        return { data: await statusResponse.json(), error: false };
      })();
      return statusError || !statusData ? usage : statusData;
    } catch (error) {
      console.error("AI budget finalization error", String(error?.message || error));
      return usage;
    }
  }

  try {
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 800
    });
    const answer = result?.response || result?.generated_text || "";
    const actualNeurons = Number(result?.usage?.neurons);
    usage = await finishBudget(Number.isFinite(actualNeurons) && actualNeurons >= 0 ? actualNeurons : estimatedNeurons, true);
    return json({
      text: String(answer).trim() || "回答を取得できませんでした。",
      usage
    });
  } catch (error) {
    console.error("Workers AI error", String(error?.message || error));
    usage = await finishBudget(estimatedNeurons, false);
    return json({ error: "AIの生成に失敗しました。Cloudflareの利用状況とログを確認してください。", usage }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    try {
      if (url.pathname === "/health" && request.method === "GET") return withCors(json({ ok: true, service: "kizimin-ai", mcp: "/mcp" }), origin);
      if (url.pathname.startsWith("/.well-known/oauth-protected-resource") || url.pathname === MCP_PATH) return await handleMcp(request, env);
      if (url.pathname === "/api/chat" && request.method === "POST") return withCors(await handleChat(request, env), origin);
      return withCors(json({ error: "Not found" }, 404), origin);
    } catch (error) {
      console.error("Kizimin AI gateway error", String(error?.message || error));
      return withCors(json({ error: "サーバーでエラーが発生しました。" }, 500), origin);
    }
  }
};
