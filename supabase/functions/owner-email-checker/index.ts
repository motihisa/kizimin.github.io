import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

let disposableCache: { expires: number; domains: Set<string> } | null = null;
async function getDisposableDomains(): Promise<Set<string> | null> {
  if (disposableCache && disposableCache.expires > Date.now()) return disposableCache.domains;
  try {
    const response = await fetch("https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf", {
      headers: { "Accept": "text/plain" }
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (text.length > 8_000_000) return null;
    const domains = new Set(text.split(/\r?\n/).map(line => line.trim().toLowerCase()).filter(line => line && !line.startsWith("#") && /^[a-z0-9.-]+$/.test(line)));
    if (!domains.size) return null;
    disposableCache = { expires: Date.now() + 5 * 60 * 1000, domains };
    return domains;
  } catch {
    return null;
  }
}

async function dnsQuery(domain: string, type: "MX" | "A" | "AAAA") {
  const response = await fetch("https://dns.google/resolve?name=" + encodeURIComponent(domain) + "&type=" + type, {
    headers: { "Accept": "application/dns-json" }
  });
  if (!response.ok) throw new Error("DNS_LOOKUP_FAILED");
  return await response.json();
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
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) &&
      domain.length <= 253 && domain.includes(".") &&
      domain.split(".").every(part => part.length > 0 && part.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part));
    if (!formatValid) return json({ result: { format_valid: false, domain, mx_found: null, domain_resolves: null, disposable: "unknown", role_based: false, note: "メールアドレスの形式が正しくありません。" } });

    const roleBased = /^(admin|administrator|support|info|contact|help|sales|billing|postmaster|webmaster|noreply|no-reply|security|abuse|office|team|hello)$/i.test(local);
    const [disposableDomains, mxResult] = await Promise.all([
      getDisposableDomains(),
      dnsQuery(domain, "MX").catch(() => null)
    ]);
    const mxFound = !!mxResult && Number(mxResult.Status) === 0 && Array.isArray(mxResult.Answer) && mxResult.Answer.some((a: any) => Number(a.type) === 15);
    let domainResolves: boolean | null = null;
    if (mxFound) domainResolves = true;
    else if (mxResult && Number(mxResult.Status) === 0) {
      const [aResult, aaaaResult] = await Promise.all([
        dnsQuery(domain, "A").catch(() => null),
        dnsQuery(domain, "AAAA").catch(() => null)
      ]);
      domainResolves = [aResult, aaaaResult].some((r: any) => r && Number(r.Status) === 0 && Array.isArray(r.Answer) && r.Answer.length > 0);
    }
    const disposable = disposableDomains ? (disposableDomains.has(domain) ? "yes" : "no") : "unknown";
    return json({ result: {
      format_valid: true, domain, mx_found: mxResult ? mxFound : null,
      domain_resolves: domainResolves, disposable, role_based: roleBased,
      note: "個別のメールボックスの存在・受信可能性は確認していません。DNS確認ではドメイン名のみを外部DNSサービスへ送信します。"
    }});
  } catch (error) {
    console.error("owner-email-checker error", error instanceof Error ? error.message : "unknown");
    return json({ error: "CHECK_FAILED" }, 500);
  }
});
