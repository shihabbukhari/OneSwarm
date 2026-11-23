/**
 * Same-origin proxy to the OneSwarm server, so session cookies stay first-party.
 * The target comes from SERVER_URL at runtime, not at build time.
 */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

async function proxy(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  const target = new URL(
    `/api/${path.map(encodeURIComponent).join("/")}`,
    process.env.SERVER_URL ?? "http://localhost:4000",
  );
  target.search = new URL(req.url).search;
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key)) headers.set(key, value);
  });
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const res = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    redirect: "manual",
    // @ts-expect-error -- Node fetch needs this to stream a request body
    duplex: hasBody ? "half" : undefined,
  });
  const out = new Headers();
  res.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key) && key !== "set-cookie" && key !== "content-encoding")
      out.set(key, value);
  });
  for (const cookie of res.headers.getSetCookie()) out.append("set-cookie", cookie);
  return new Response(res.body, { status: res.status, headers: out });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const dynamic = "force-dynamic";
