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

  const visitorId = clampText(body.visitor_id, 120);
  if (!visitorId) return jsonResponse({ error: "visitor_id is required" }, 400);

  const ip = getClientIp(req);
  const ipHash = await sha256(`${analyticsSalt}:${ip}`);
  const geo = getHeaderGeo(req);
  const requestUserAgent = req.headers.get("user-agent") || "";

  const record = {
    event_type: pickEventType(body.event_type),
    visitor_id: visitorId,
    session_id: clampText(body.session_id, 120),
    page_path: clampText(body.page_path, 500) || "/",
    page_url: clampText(body.page_url, 1000),
    referrer: clampText(body.referrer, 1000),
    ip_hash: ipHash,
    country: clampText(geo.country, 120),
    region: clampText(geo.region, 120),
    city: clampText(geo.city, 120),
    device_type: pickDeviceType(body.device_type),
    os_name: clampText(body.os_name, 120),
    os_version: clampText(body.os_version, 120),
    browser_name: clampText(body.browser_name, 120),
    browser_version: clampText(body.browser_version, 120),
    user_agent: clampText(body.user_agent, 600) || clampText(requestUserAgent, 600),
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
    metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {},
  };

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("visit_analytics").insert(record);
  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({ ok: true });
});