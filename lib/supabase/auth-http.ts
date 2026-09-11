import https from "node:https";
import { URL } from "node:url";

function readEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local");
  }
  return { url: url.replace(/\/$/, ""), key };
}

function httpsJson(pathname: string, body: unknown) {
  const { url, key } = readEnv();
  const target = new URL(`${url}${pathname}`);
  const payload = JSON.stringify(body);

  return new Promise<{ status: number; json: Record<string, unknown> }>((resolve, reject) => {
    const req = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method: "POST",
        family: 4,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: Record<string, unknown> = {};
          try {
            json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
          } catch {
            json = { message: text || `HTTP ${res.statusCode}` };
          }
          resolve({ status: res.statusCode ?? 500, json });
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export async function signupWithPassword(input: {
  email: string;
  password: string;
  fullName: string;
}) {
  return httpsJson("/auth/v1/signup", {
    email: input.email,
    password: input.password,
    data: { full_name: input.fullName },
  });
}

export async function signinWithPassword(input: { email: string; password: string }) {
  return httpsJson("/auth/v1/token?grant_type=password", {
    email: input.email,
    password: input.password,
  });
}
