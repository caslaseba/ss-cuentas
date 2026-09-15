import https from "node:https";
import { URL } from "node:url";
import { normalizeSupabaseUrl } from "@/lib/supabase/env";

export function getSupabaseUrl() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!url) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL en .env.local");
  return url;
}

export function getSupabaseKey(kind: "anon" | "service") {
  const key =
    kind === "service"
      ? process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!key) {
    throw new Error(
      kind === "service"
        ? "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local (Supabase → Settings → API → service_role)."
        : "Falta NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local",
    );
  }
  return key;
}

export function hasServiceRoleKey() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function supabaseHttps(input: {
  pathname: string;
  method?: string;
  body?: unknown;
  key?: "anon" | "service";
  extraHeaders?: Record<string, string>;
}) {
  const url = getSupabaseUrl();
  const key = getSupabaseKey(input.key ?? "anon");
  const method = input.method ?? (input.body === undefined ? "GET" : "POST");
  const target = new URL(`${url}${input.pathname}`);
  const payload = input.body === undefined ? undefined : JSON.stringify(input.body);

  return new Promise<{ status: number; json: unknown }>((resolve, reject) => {
    const headers: Record<string, string> = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...input.extraHeaders,
    };
    if (payload !== undefined) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(Buffer.byteLength(payload));
    }

    const req = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method,
        family: 4,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: unknown = {};
          try {
            json = text ? JSON.parse(text) : {};
          } catch {
            json = { message: text || `HTTP ${res.statusCode}` };
          }
          resolve({ status: res.statusCode ?? 500, json });
        });
      },
    );
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

export function asRecord(json: unknown): Record<string, unknown> {
  if (json && typeof json === "object" && !Array.isArray(json)) {
    return json as Record<string, unknown>;
  }
  return { message: typeof json === "string" ? json : "Error inesperado." };
}

export function errorMessage(json: unknown, fallback: string) {
  const rec = asRecord(json);
  for (const key of ["msg", "message", "error_description", "error"]) {
    const value = rec[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}
