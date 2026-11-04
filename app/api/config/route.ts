export const dynamic = "force-dynamic";
export function GET() {
  const anonKey =
    process.env.FOODLAB_PUBLIC_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  const selfhost = Boolean(
    process.env.FOODLAB_SUPABASE_AUTH_URL &&
    process.env.FOODLAB_SUPABASE_REST_URL,
  );
  return Response.json(
    {
      configured: Boolean(
        anonKey && (selfhost || process.env.NEXT_PUBLIC_SUPABASE_URL),
      ),
      anonKey,
      url: selfhost ? "/supabase" : process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      passwordAuth:
        selfhost || process.env.NEXT_PUBLIC_SUPABASE_AUTH_MODE === "password",
      channel:
        process.env.FOODLAB_RELEASE_CHANNEL ||
        process.env.NEXT_PUBLIC_RELEASE_CHANNEL ||
        "testing",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
