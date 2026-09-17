import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RootFrame } from "@/components/layout/root-frame";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <html lang="es" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <RootFrame>{children}</RootFrame>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
