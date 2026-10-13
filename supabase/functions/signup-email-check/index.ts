import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type CachedResult = {
  expiresAt: number;
  blocked: boolean;
  text: string | null;
  reason: string | null;
  risk: number | null;
  isDisposable: boolean | null;
  possibleTypo: string[];
};

// Best-effort per-instance cache; avoids repeated API requests for the same email for one hour.
const cache = new Map<string, CachedResult>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "INVALID_REQUEST" }, 400);
  }

  const email = normalizeEmail(body?.email);
  if (!email) return json({ error: "INVALID_EMAIL", message: "メールアドレスの形式を確認してください。" }, 400);

  const now = Date.now();
  const cached = cache.get(email);
  if (cached && cached.expiresAt > now) {
    return json({ blocked: cached.blocked, unavailable: false, result: {
      text: cached.text, reason: cached.reason, risk: cached.risk,
      is_disposable: cached.isDisposable, possible_typo: cached.possibleTypo,
      cached: true,
    }});
  }
  if (cached) cache.delete(email);

  const apiKey = Deno.env.get("CHECK_MAIL_API_KEY")?.trim();
  if (!apiKey) {
    console.warn("signup_email_check_unavailable", JSON.stringify({ code: "NOT_CONFIGURED" }));
    return json({ blocked: false, unavailable: true, code: "NOT_CONFIGURED" });
  }

  try {
    const response = await fetch("https://api.check-mail.org/v2/", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ email }),
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) {
      console.warn("signup_email_check_unavailable", JSON.stringify({
        provider: "check-mail",
        code: response.status === 401 || response.status === 403 ? "AUTH_ERROR"
          : response.status === 429 ? "RATE_OR_QUOTA_LIMIT"
          : response.status >= 500 ? "PROVIDER_ERROR" : "HTTP_ERROR",
        http_status: response.status,
      }));
      return json({ blocked: false, unavailable: true, code: "PROVIDER_UNAVAILABLE" });
    }

    const data = await response.json();
    // The API block field is the primary policy decision. If absent or malformed, fail open.
    if (typeof data?.block !== "boolean") {
      console.warn("signup_email_check_unavailable", JSON.stringify({ provider: "check-mail", code: "INVALID_RESPONSE" }));
      return json({ blocked: false, unavailable: true, code: "INVALID_RESPONSE" });
    }

    const result: CachedResult = {
      expiresAt: now + CACHE_TTL_MS,
      blocked: data.block,
      text: typeof data.text === "string" ? data.text.slice(0, 300) : null,
      reason: typeof data.reason === "string" ? data.reason.slice(0, 160) : null,
      risk: typeof data.risk === "number" && Number.isFinite(data.risk)
        ? Math.max(0, Math.min(100, data.risk)) : null,
      isDisposable: typeof data.is_disposable === "boolean" ? data.is_disposable : null,
      possibleTypo: Array.isArray(data.possible_typo)
        ? data.possible_typo.filter((item: unknown): item is string => typeof item === "string").slice(0, 5)
        : [],
    };
    cache.set(email, result);
    return json({
      blocked: result.blocked,
      unavailable: false,
      result: {
        text: result.text,
        reason: result.reason,
        risk: result.risk,
        is_disposable: result.isDisposable,
        possible_typo: result.possibleTypo,
        cached: false,
      },
    });
  } catch (error) {
    console.warn("signup_email_check_unavailable", JSON.stringify({
      provider: "check-mail",
      code: error instanceof Error && error.name === "TimeoutError" ? "TIMEOUT" : "NETWORK_ERROR",
    }));
    // Fail open on provider/network failure so signup remains available.
    return json({ blocked: false, unavailable: true, code: "NETWORK_ERROR" });
  }
});
