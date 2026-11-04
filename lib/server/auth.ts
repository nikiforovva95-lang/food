import type { NextRequest } from "next/server";
export async function authenticatedUser(request: NextRequest) {
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) return null;
  const base =
    process.env.FOODLAB_SUPABASE_AUTH_URL ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL
      ? process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1"
      : null);
  if (!base) return null;
  try {
    const response = await fetch(base + "/user", {
      headers: {
        authorization: token,
        apikey:
          process.env.FOODLAB_PUBLIC_ANON_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
          "",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const user = await response.json();
    return typeof user.id === "string" ? { id: user.id, token } : null;
  } catch {
    return null;
  }
}
export function restUrl() {
  return (
    process.env.FOODLAB_SUPABASE_REST_URL ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL
      ? process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1"
      : null)
  );
}
