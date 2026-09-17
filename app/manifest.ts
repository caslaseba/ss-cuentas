import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SS Cuentas",
    short_name: "SS Cuentas",
    description: "Finanzas personales con carga por voz",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f8faf9",
    theme_color: "#0f766e",
    lang: "es-AR",
    id: "https://ss-cuentas.vercel.app/",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
