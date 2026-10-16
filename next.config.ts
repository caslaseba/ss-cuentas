import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // El server escucha en 0.0.0.0 y el navegador entra por 127.0.0.1.
  // Sin esto Next bloquea el websocket de desarrollo.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // El canal de depuración de React espera ese websocket. Si no abre,
  // la página se queda en el HTML del servidor ("Cargando tus cuentas").
  experimental: {
    reactDebugChannel: false,
  },
};

export default nextConfig;
