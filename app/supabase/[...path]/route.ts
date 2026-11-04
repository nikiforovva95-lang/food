import { limitedText } from "@/lib/server/body";
import { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Deliberately restricted gateway: the browser never receives DB passwords or service-role keys.
// The only public surface is Auth user operations and the application's RLS-protected table.
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const isAuth = path[0] === "auth" && path[1] === "v1";
  const isRest = path[0] === "rest" && path[1] === "v1";
  const restPath = path.slice(2).join("/");
  const allowedAuth = new Set([
    "health",
    "settings",
    "signup",
    "token",
    "logout",
    "user",
  ]);
  if (
    (!isAuth && !isRest) ||
    (isAuth && !allowedAuth.has(restPath)) ||
    (isRest && restPath !== "foodlab_states")
  )
    return Response.json({ error: "Not found" }, { status: 404 });
  const base = isAuth
    ? process.env.FOODLAB_SUPABASE_AUTH_URL
    : process.env.FOODLAB_SUPABASE_REST_URL;
  if (!base)
    return Response.json(
      { error: "Self-hosted Supabase is not configured" },
      { status: 503 },
    );
  const target = new URL(isAuth ? `/${restPath}` : `/${restPath}`, base);
  target.search = request.nextUrl.search;
  const headers = new Headers();
  for (const key of [
    "authorization",
    "apikey",
    "content-type",
    "prefer",
    "accept",
    "range",
    "range-unit",
    "x-client-info",
    "x-supabase-api-version",
  ]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  // Behind a reverse proxy Next's internal origin can differ from the browser's.
  // Match the requested public host as well as the internal URL host.
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && request.method !== "HEAD" && origin) {
    const hosts = [
      request.nextUrl.host,
      request.headers.get("host"),
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim(),
    ];
    try {
      if (!hosts.includes(new URL(origin).host))
        return Response.json({ error: "Origin not allowed" }, { status: 403 });
    } catch {
      return Response.json({ error: "Origin not allowed" }, { status: 403 });
    }
  }
  try {
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await limitedText(request, 5000000);
    if (body && Buffer.byteLength(body) > 5_000_000)
      return Response.json({ error: "Document exceeds 5 MB" }, { status: 413 });
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    const responseHeaders = new Headers({ "cache-control": "no-store" });
    for (const key of [
      "content-type",
      "content-range",
      "preference-applied",
      "range-unit",
      "www-authenticate",
      "retry-after",
    ]) {
      const value = upstream.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (e) {
    const tooLarge = e instanceof Error && e.message === "BODY_TOO_LARGE";
    return Response.json(
      {
        error: tooLarge
          ? "Document exceeds 5 MB"
          : "Supabase is temporarily unavailable",
      },
      { status: tooLarge ? 413 : 503 },
    );
  }
}
export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as HEAD,
};
