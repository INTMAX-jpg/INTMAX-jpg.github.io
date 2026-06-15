import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const analyticsSalt = Deno.env.get("VISIT_ANALYTICS_SALT") || "zixi-visit-analytics";

function getSupabaseAdminClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function firstHeader(req: Request, names: string[]) {
  for (const name of names) {
    const value = req.headers.get(name);
    if (value) return value;
  }
  return "";
}

function getClientIp(req: Request) {
  const forwarded = firstHeader(req, [
    "cf-connecting-ip",
    "x-real-ip",
    "x-forwarded-for",
    "fly-client-ip",
    "x-client-ip",
  ]);
  return forwarded.split(",")[0]?.trim() || "";
}

async function sha256(value: string) {
  if (!value) return null;
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function clampText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function cleanGeoText(value: unknown, maxLength: number) {
  const text = clampText(value, maxLength);
  if (!text) return null;
  const normalized = text.toLowerCase();
  if (["unknown", "unknown/unknown", "n/a", "na", "null", "undefined"].includes(normalized)) return null;
  return text;
}

function clampInt(value: unknown, min = 0, max = 100000000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function pickDeviceType(value: unknown) {
  return ["desktop", "mobile", "tablet", "unknown"].includes(String(value))
    ? String(value)
    : "unknown";
}

function pickEventType(value: unknown) {
  return value === "gallery_load" ? "gallery_load" : "page_view";
}

function isEasterEggDiscoveryEvent(value: unknown) {
  return value === "easter_egg_discovery";
}
const botRules = [
  { name: "Bingbot", regex: /bingbot/i },
  { name: "Googlebot", regex: /googlebot/i },
  { name: "Baiduspider", regex: /baiduspider/i },
  { name: "YandexBot", regex: /yandexbot/i },
  { name: "DuckDuckBot", regex: /duckduckbot/i },
  { name: "Bytespider", regex: /bytespider/i },
  { name: "FacebookExternalHit", regex: /facebookexternalhit/i },
  { name: "Twitterbot", regex: /twitterbot/i },
  { name: "LinkedInBot", regex: /linkedinbot/i },
  { name: "WhatsApp", regex: /whatsapp/i },
  { name: "TelegramBot", regex: /telegrambot/i },
];

function detectBot(userAgent: string | null) {
  const ua = userAgent || "";
  for (const rule of botRules) {
    if (rule.regex.test(ua)) return { isBot: true, name: rule.name };
  }
  return { isBot: false, name: null };
}

function safeDecodeHeader(value: string) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
}

function getHeaderGeo(req: Request) {
  return {
    country: firstHeader(req, ["cf-ipcountry", "x-vercel-ip-country", "x-country-code"]),
    region: safeDecodeHeader(firstHeader(req, ["x-vercel-ip-country-region", "x-region", "x-region-code"])),
    city: safeDecodeHeader(firstHeader(req, ["x-vercel-ip-city", "x-city"])),
  };
}

function isProbablyPrivateIp(ip: string) {
  if (!ip) return true;
  const normalized = ip.toLowerCase();
  if (normalized === "localhost" || normalized === "::1" || normalized === "127.0.0.1") return true;
  if (normalized.startsWith("10.")) return true;
  if (normalized.startsWith("192.168.")) return true;
  if (normalized.startsWith("169.254.")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  const private172 = normalized.match(/^172\.(\d+)\./);
  if (private172) {
    const block = Number(private172[1]);
    if (block >= 16 && block <= 31) return true;
  }

  return false;
}

function hasUsefulGeo(geo: { country?: string | null; region?: string | null; city?: string | null } | null) {
  return Boolean(cleanGeoText(geo?.country, 120) || cleanGeoText(geo?.region, 120) || cleanGeoText(geo?.city, 120));
}

async function getCachedGeo(supabase: ReturnType<typeof createClient>, ipHash: string | null) {
  if (!ipHash) return null;

  const { data, error } = await supabase
    .from("visit_ip_geo_cache")
    .select("country, region, city, country_code, geo_provider, metadata")
    .eq("ip_hash", ipHash)
    .maybeSingle();

  if (error || !data || !hasUsefulGeo(data)) return null;

  await supabase
    .from("visit_ip_geo_cache")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("ip_hash", ipHash);

  return {
    country: cleanGeoText(data.country, 120),
    region: cleanGeoText(data.region, 120),
    city: cleanGeoText(data.city, 120),
    countryCode: clampText(data.country_code, 20),
    provider: clampText(data.geo_provider, 80) || "cache",
    metadata: typeof data.metadata === "object" && data.metadata !== null ? data.metadata : {},
  };
}

async function lookupIpApiGeo(ip: string) {
  if (isProbablyPrivateIp(ip)) return null;

  const fields = [
    "status",
    "message",
    "country",
    "countryCode",
    "region",
    "regionName",
    "city",
    "timezone",
    "isp",
    "org",
    "as",
    "proxy",
    "hosting",
    "mobile",
  ].join(",");
  const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${fields}&lang=en`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (data?.status !== "success") return null;

    return {
      country: cleanGeoText(data.country, 120),
      region: cleanGeoText(data.regionName || data.region, 120),
      city: cleanGeoText(data.city, 120),
      countryCode: clampText(data.countryCode, 20),
      provider: "ip-api.com",
      metadata: {
        timezone: clampText(data.timezone, 120),
        isp: clampText(data.isp, 160),
        org: clampText(data.org, 160),
        as: clampText(data.as, 160),
        proxy: Boolean(data.proxy),
        hosting: Boolean(data.hosting),
        mobile: Boolean(data.mobile),
      },
    };
  } catch (_error) {
    return null;
  }
}

async function cacheGeo(
  supabase: ReturnType<typeof createClient>,
  ipHash: string | null,
  geo: {
    country?: string | null;
    region?: string | null;
    city?: string | null;
    countryCode?: string | null;
    provider?: string | null;
    metadata?: Record<string, unknown>;
  } | null,
) {
  if (!ipHash || !geo || !hasUsefulGeo(geo)) return;

  await supabase.from("visit_ip_geo_cache").upsert(
    {
      ip_hash: ipHash,
      country: cleanGeoText(geo.country, 120),
      region: cleanGeoText(geo.region, 120),
      city: cleanGeoText(geo.city, 120),
      country_code: clampText(geo.countryCode, 20),
      geo_provider: clampText(geo.provider, 80) || "unknown",
      metadata: geo.metadata || {},
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "ip_hash" },
  );
}

async function resolveGeo(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  ip: string,
  ipHash: string | null,
) {
  const cachedGeo = await getCachedGeo(supabase, ipHash);
  if (cachedGeo && hasUsefulGeo(cachedGeo)) return cachedGeo;

  const apiGeo = await lookupIpApiGeo(ip);
  if (apiGeo && hasUsefulGeo(apiGeo)) {
    await cacheGeo(supabase, ipHash, apiGeo);
    return apiGeo;
  }

  const headerGeo = getHeaderGeo(req);
  if (hasUsefulGeo(headerGeo)) {
    const geo = {
      country: cleanGeoText(headerGeo.country, 120),
      region: cleanGeoText(headerGeo.region, 120),
      city: cleanGeoText(headerGeo.city, 120),
      countryCode: null,
      provider: "request-headers",
      metadata: {},
    };
    await cacheGeo(supabase, ipHash, geo);
    return geo;
  }

  return {
    country: null,
    region: null,
    city: null,
    countryCode: null,
    provider: null,
    metadata: {},
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: "Function is not configured" }, 500);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_error) {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const supabase = getSupabaseAdminClient();
  const ip = getClientIp(req);
  const ipHash = await sha256(`${analyticsSalt}:${ip}`);
  const requestUserAgent = req.headers.get("user-agent") || "";
  const bodyUserAgent = clampText(body.user_agent, 600);
  const effectiveUserAgent = bodyUserAgent || clampText(requestUserAgent, 600);
  const sourceMetadata = typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {};
  const isEasterEggDiscovery = isEasterEggDiscoveryEvent(body.event_type);
  const bot = detectBot(effectiveUserAgent);

  if (bot.isBot) {
    const botRecord = {
      event_type: pickEventType(body.event_type),
      page_path: clampText(body.page_path, 500) || "/",
      page_url: clampText(body.page_url, 1000),
      referrer: clampText(body.referrer, 1000),
      ip_hash: ipHash,
      bot_name: bot.name,
      user_agent: effectiveUserAgent,
      metadata: sourceMetadata,
    };

    const { error } = await supabase.from("bot_visit_logs").insert(botRecord);
    if (error) {
      console.warn("bot visit log insert failed", error.message);
    }

    return jsonResponse({ ok: true, bot: true, bot_name: bot.name, bot_logged: !error });
  }

  const visitorId = clampText(body.visitor_id, 120);
  if (!visitorId) return jsonResponse({ error: "visitor_id is required" }, 400);

  if (isEasterEggDiscovery) {
    const { data, error } = await supabase.rpc("register_easter_egg_discovery", {
      p_visitor_id: visitorId,
    });
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ ok: true, event_type: "easter_egg_discovery", discovery: data || {} });
  }

  const geo = await resolveGeo(req, supabase, ip, ipHash);

  const record = {
    event_type: pickEventType(body.event_type),
    visitor_id: visitorId,
    session_id: clampText(body.session_id, 120),
    page_path: clampText(body.page_path, 500) || "/",
    page_url: clampText(body.page_url, 1000),
    referrer: clampText(body.referrer, 1000),
    ip_hash: ipHash,
    country: cleanGeoText(geo.country, 120),
    region: cleanGeoText(geo.region, 120),
    city: cleanGeoText(geo.city, 120),
    device_type: pickDeviceType(body.device_type),
    os_name: clampText(body.os_name, 120),
    os_version: clampText(body.os_version, 120),
    browser_name: clampText(body.browser_name, 120),
    browser_version: clampText(body.browser_version, 120),
    user_agent: effectiveUserAgent,
    language: clampText(body.language, 80),
    timezone: clampText(body.timezone, 120),
    screen_width: clampInt(body.screen_width, 0, 20000),
    screen_height: clampInt(body.screen_height, 0, 20000),
    viewport_width: clampInt(body.viewport_width, 0, 20000),
    viewport_height: clampInt(body.viewport_height, 0, 20000),
    pixel_ratio: Number.isFinite(Number(body.pixel_ratio)) ? Number(body.pixel_ratio) : null,
    gallery_load_ms: clampInt(body.gallery_load_ms, 0),
    gallery_image_total: clampInt(body.gallery_image_total, 0),
    gallery_image_loaded: clampInt(body.gallery_image_loaded, 0),
    gallery_image_failed: clampInt(body.gallery_image_failed, 0),
    metadata: {
      ...sourceMetadata,
      geo_provider: geo.provider,
      geo_country_code: geo.countryCode,
      geo_metadata: geo.metadata,
    },
  };

  const { error } = await supabase.from("visit_analytics").insert(record);
  if (error) return jsonResponse({ error: error.message }, 500);

  const { error: rollupError } = await supabase.rpc("refresh_visit_analytics_rollup");
  if (rollupError) {
    console.warn("visit analytics rollup refresh failed", rollupError.message);
  }

  return jsonResponse({ ok: true, rollup_refreshed: !rollupError });
});
