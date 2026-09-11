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
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
