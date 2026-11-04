import { fetch as undiciFetch, ProxyAgent } from "undici";
let agent: ProxyAgent | undefined;
export async function externalFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxy && !agent) agent = new ProxyAgent(proxy);
  return (await undiciFetch(url, { ...init, dispatcher: agent } as Parameters<
    typeof undiciFetch
  >[1])) as unknown as Response;
}
