import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

let disposableCache: { expires: number; domains: Set<string>; sources: number } | null = null;

function parseDomainList(text: string, isJson: boolean): Set<string> {
  let entries: unknown;
  if (isJson) {
    try { entries = JSON.parse(text); } catch { entries = []; }
  }
  const lines = Array.isArray(entries)
    ? entries
    : text.split(/\r?\n/);
  return new Set(lines
    .filter((item): item is string => typeof item === "string")
    .map(line => line.trim().toLowerCase())
    .filter(line => line && !line.startsWith("#") && /^[a-z0-9.-]+$/.test(line) && line.includes(".")));
}

async function getDisposableDomains(): Promise<{ domains: Set<string>; sources: number } | null> {
  if (disposableCache && disposableCache.expires > Date.now()) {
    return { domains: disposableCache.domains, sources: disposableCache.sources };
  }

  // 2つの公開リストを併用。片方が停止しても、もう片方が取得できれば判定を続ける。
  const sources = [
    { url: "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf", json: false },
    { url: "https://raw.githubusercontent.com/ivolo/disposable-email-domains/master/index.json", json: true }
  ];
  const results = await Promise.allSettled(sources.map(async source => {
    const response = await fetch(source.url, {
      headers: { "Accept": source.json ? "application/json" : "text/plain" },
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) throw new Error("DISPOSABLE_LIST_UNAVAILABLE");
    const text = await response.text();
    if (text.length > 12_000_000) throw new Error("DISPOSABLE_LIST_TOO_LARGE");
    const domains = parseDomainList(text, source.json);
    if (!domains.size) throw new Error("DISPOSABLE_LIST_EMPTY");
    return domains;
  }));

  const merged = new Set<string>();
  let successfulSources = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      successfulSources++;
      for (const domain of result.value) merged.add(domain);
    }
  }
  if (!successfulSources || !merged.size) return null;
  disposableCache = { expires: Date.now() + 10 * 60 * 1000, domains: merged, sources: successfulSources };
  return { domains: merged, sources: successfulSources };
}

async function dnsQuery(domain: string, type: "MX" | "A" | "AAAA" | "TXT") {
  const response = await fetch("https://dns.google/resolve?name=" + encodeURIComponent(domain) + "&type=" + type, {
    headers: { "Accept": "application/dns-json" },
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error("DNS_LOOKUP_FAILED");
  return await response.json();
}


function txtRecords(response: any): string[] {
  if (!response || Number(response.Status) !== 0 || !Array.isArray(response.Answer)) return [];
  return response.Answer
    .filter((answer: any) => Number(answer.type) === 16 && typeof answer.data === "string")
    .map((answer: any) => String(answer.data).replace(/^"|"$/g, "").replace(/"\s+"/g, ""));
}

function hasTxtPrefix(response: any, prefix: string): boolean | null {
  if (!response) return null;
  if (Number(response.Status) === 3) return false;
  if (Number(response.Status) !== 0) return null;
  return txtRecords(response).some(record => record.trim().toLowerCase().startsWith(prefix.toLowerCase()));
}

function dmarcPolicy(response: any): string | null {
  const record = txtRecords(response).find(value => /^\s*v=DMARC1(?:;|$)/i.test(value));
  const match = record?.match(/(?:^|;)\s*p\s*=\s*(none|quarantine|reject)\s*(?:;|$)/i);
  return match ? match[1].toLowerCase() : null;
}

function isDisposable(domain: string, domains: Set<string>): boolean {
  // サブドメインも親ドメインのブロック対象に含める。
  let candidate = domain;
  while (candidate.includes(".")) {
    if (domains.has(candidate)) return true;
    candidate = candidate.slice(candidate.indexOf(".") + 1);
  }
  return domains.has(candidate);
}

type AbstractCheck = {
  configured: boolean;
  checked: boolean;
  deliverability: string | null;
  smtp_valid: boolean | null;
  mx_valid: boolean | null;
  disposable: boolean | null;
  catchall: boolean | null;
  role_based: boolean | null;
  quality_score: number | null;
  note: string;
};

async function checkWithAbstract(email: string): Promise<AbstractCheck> {
  const apiKey = Deno.env.get("ABSTRACT_API_KEY");
  const base = {
    configured: Boolean(apiKey), checked: false, deliverability: null,
    smtp_valid: null, mx_valid: null, disposable: null, catchall: null,
    role_based: null, quality_score: null,
    note: apiKey ? "外部APIから判定結果を取得できませんでした。" : "ABSTRACT_API_KEY未設定のため未実行です。"
  };
  if (!apiKey) return base;
  try {
    const endpoint = new URL("https://emailvalidation.abstractapi.com/v1/");
    endpoint.searchParams.set("api_key", apiKey);
    endpoint.searchParams.set("email", email);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) return base;
    const data = await response.json();
    const delivery = data?.email_deliverability ?? {};
    const quality = data?.email_quality ?? {};
    const nullableBool = (value: unknown): boolean | null => {
      if (typeof value === "boolean") return value;
      if (value && typeof value === "object" && "value" in value) {
        const inner = (value as { value?: unknown }).value;
        return typeof inner === "boolean" ? inner : null;
      }
      return null;
    };
    const scoreRaw = data?.quality_score ?? quality?.score;
    const scoreValue = typeof scoreRaw === "string" || typeof scoreRaw === "number" ? Number(scoreRaw) : NaN;
    return {
      configured: true,
      checked: true,
      deliverability: typeof data?.deliverability === "string"
        ? data.deliverability
        : typeof delivery?.status === "string" ? delivery.status : null,
      smtp_valid: nullableBool(data?.is_smtp_valid ?? delivery?.is_smtp_valid),
      mx_valid: nullableBool(data?.is_mx_found ?? data?.is_mx_valid ?? delivery?.is_mx_valid),
      disposable: nullableBool(data?.is_disposable_email ?? data?.is_disposable ?? quality?.is_disposable),
      catchall: nullableBool(data?.is_catchall_email ?? data?.is_catchall ?? quality?.is_catchall),
      role_based: nullableBool(data?.is_role_email ?? data?.is_role ?? quality?.is_role),
      quality_score: Number.isFinite(scoreValue) ? scoreValue : null,
      note: "Abstract APIの結果です。メールアドレスは判定のため外部サービスへ送信されます。SMTP判定も受信箱の存在を完全に保証するものではありません。"
    };
  } catch {
    return base;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return json({ error: "AUTH_REQUIRED" }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "SERVER_CONFIG_ERROR" }, 500);

    const admin = createClient(url, serviceKey);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "INVALID_SESSION" }, 401);

    const userId = authData.user.id;
    const [{ data: ownerRow, error: ownerError }, { data: profile, error: profileError }] = await Promise.all([
      admin.from("site_owners").select("user_id").eq("user_id", userId).maybeSingle(),
      admin.from("profiles").select("account_status").eq("id", userId).maybeSingle()
    ]);
    if (ownerError || profileError) return json({ error: "OWNER_CHECK_FAILED" }, 500);
    if (!ownerRow || (profile?.account_status && profile.account_status !== "active")) return json({ error: "OWNER_ONLY" }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim();
    if (!email || email.length > 254 || /[\r\n\s]/.test(email)) return json({ error: "INVALID_EMAIL" }, 400);
    const at = email.lastIndexOf("@");
    const local = email.slice(0, at);
    const domain = email.slice(at + 1).toLowerCase();
    const formatValid = at > 0 && at === email.indexOf("@") && local.length <= 64 &&
      /^[a-zA-Z0-9.!#$%&'*+/=?^`{|}~-]+$/.test(local) &&
      !local.startsWith(".") && !local.endsWith(".") && !local.includes("..") &&
      domain.length <= 253 && domain.includes(".") &&
      domain.split(".").every(part => part.length > 0 && part.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part));
    if (!formatValid) return json({ result: { format_valid: false, domain, mx_found: null, domain_resolves: null, disposable: "unknown", disposable_sources: 0, role_based: false, note: "メールアドレスの形式が正しくありません。" } });

    const roleBased = /^(admin|administrator|support|info|contact|help|sales|billing|postmaster|webmaster|noreply|no-reply|security|abuse|office|team|hello)$/i.test(local);
    const [disposableData, mxResult, txtResult, dmarcResult, abstractResult] = await Promise.all([
      getDisposableDomains(),
      dnsQuery(domain, "MX").catch(() => null),
      dnsQuery(domain, "TXT").catch(() => null),
      dnsQuery("_dmarc." + domain, "TXT").catch(() => null),
      checkWithAbstract(email)
    ]);
    const mxFound = !!mxResult && Number(mxResult.Status) === 0 &&
      Array.isArray(mxResult.Answer) && mxResult.Answer.some((a: any) => Number(a.type) === 15);

    let domainResolves: boolean | null = null;
    if (mxFound) {
      domainResolves = true;
    } else if (mxResult && Number(mxResult.Status) === 3) {
      domainResolves = false; // NXDOMAIN
    } else if (mxResult && Number(mxResult.Status) === 0) {
      const [aResult, aaaaResult] = await Promise.all([
        dnsQuery(domain, "A").catch(() => null),
        dnsQuery(domain, "AAAA").catch(() => null)
      ]);
      const hasAddress = [aResult, aaaaResult].some((r: any) =>
        r && Number(r.Status) === 0 && Array.isArray(r.Answer) && r.Answer.length > 0);
      const allQueriesReturned = !!aResult && !!aaaaResult;
      domainResolves = hasAddress ? true :
        (allQueriesReturned && [aResult, aaaaResult].every((r: any) => Number(r.Status) === 3) ? false : null);
    }

    const disposable = disposableData
      ? (isDisposable(domain, disposableData.domains) ? "yes" : "no")
      : "unknown";
    const spfRecords = txtRecords(txtResult).filter(record => /^\s*v=spf1(?:\s|$)/i.test(record));
    const spfFound = hasTxtPrefix(txtResult, "v=spf1");
    const dmarcFound = hasTxtPrefix(dmarcResult, "v=DMARC1");
    const policy = dmarcPolicy(dmarcResult);
    return json({ result: {
      format_valid: true,
      domain,
      mx_found: mxResult && Number(mxResult.Status) === 0 ? mxFound : mxResult && Number(mxResult.Status) === 3 ? false : null,
      domain_resolves: domainResolves,
      disposable,
      disposable_sources: disposableData?.sources ?? 0,
      role_based: roleBased,
      spf_found: spfFound,
      spf_multiple: spfRecords.length > 1 ? true : spfRecords.length === 1 ? false : spfFound === false ? false : null,
      dmarc_found: dmarcFound,
      dmarc_policy: policy,
      abstract_api: abstractResult,
      note: "使い捨て判定は最大2つの公開リストを照合します。SPF/DMARCはドメインの送信認証設定の確認です。DNS確認ではドメイン名のみをGoogle Public DNSへ送信します。ABSTRACT_API_KEYを設定した場合、メールアドレス全体をAbstract APIへ送信して追加判定します。メールアドレスはこの関数で保存しません。判定不能は失敗や不正を意味しません。"
    }});
  } catch (error) {
    console.error("owner-email-checker error", error instanceof Error ? error.message : "unknown");
    return json({ error: "CHECK_FAILED" }, 500);
  }
});
