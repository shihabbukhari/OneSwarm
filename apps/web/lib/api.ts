/** Fetch wrapper for the OneSwarm API with the double-submit CSRF header. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

function csrfToken(): string {
  const match = /(?:^|;\s*)os_csrf=([^;]+)/.exec(document.cookie);
  return match ? decodeURIComponent(match[1]!) : "";
}

async function ensureCsrf(): Promise<string> {
  let token = csrfToken();
  if (!token) {
    await fetch("/api/csrf", { credentials: "same-origin" });
    token = csrfToken();
  }
  return token;
}

export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; form?: FormData } = {},
): Promise<T> {
  const method = init.method ?? (init.body !== undefined || init.form ? "POST" : "GET");
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["x-csrf-token"] = await ensureCsrf();
  let body: BodyInit | undefined;
  if (init.form) body = init.form;
  else if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const res = await fetch(`/api${path}`, { method, headers, body, credentials: "same-origin" });
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok)
    throw new ApiError(
      res.status,
      data.error ?? `Request failed (${res.status})`,
      data.code ?? "error",
    );
  return data as T;
}
