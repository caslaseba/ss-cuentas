import type { Metadata, Viewport } from "next";
import { RootFrame } from "@/components/layout/root-frame";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "SS Cuentas",
  description: "Gestión integral de finanzas personales",
  applicationName: "SS Cuentas",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "SS Cuentas", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full">
        <RootFrame>{children}</RootFrame>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
