import https from "node:https";

export type DolarQuote = {
  oficial: number;
  tarjeta: number;
  blue: number;
  updatedAt: string | null;
  source: string;
};

function getJson(url: string) {
  const target = new URL(url);
  return new Promise<{ status: number; json: unknown }>((resolve, reject) => {
    const req = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: 443,
        path: target.pathname + target.search,
        method: "GET",
        family: 4,
        headers: { Accept: "application/json" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try {
            resolve({ status: res.statusCode ?? 500, json: text ? JSON.parse(text) : {} });
          } catch {
            resolve({ status: res.statusCode ?? 500, json: { message: text } });
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function venta(json: unknown) {
  if (!json || typeof json !== "object") return 0;
  const rec = json as Record<string, unknown>;
  const n = Number(rec.venta);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function fecha(json: unknown) {
  if (!json || typeof json !== "object") return null;
  const rec = json as Record<string, unknown>;
  return typeof rec.fechaActualizacion === "string" ? rec.fechaActualizacion : null;
}

export async function fetchDolarHoy(): Promise<DolarQuote> {
  const [oficial, tarjeta, blue] = await Promise.all([
    getJson("https://dolarapi.com/v1/dolares/oficial"),
    getJson("https://dolarapi.com/v1/dolares/tarjeta"),
    getJson("https://dolarapi.com/v1/dolares/blue"),
  ]);
  if (oficial.status >= 400 && tarjeta.status >= 400) {
    throw new Error("No se pudo leer la cotización.");
  }
  return {
    oficial: venta(oficial.json),
    tarjeta: venta(tarjeta.json) || venta(oficial.json),
    blue: venta(blue.json),
    updatedAt: fecha(tarjeta.json) || fecha(oficial.json),
    source: "DolarApi / DolarHoy",
  };
}
