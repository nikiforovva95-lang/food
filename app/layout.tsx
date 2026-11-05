import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./design.css";
export const metadata: Metadata = {
  title: "FoodLab — еда в гармонии с вами",
  description:
    "Персональные рецепты, недельное меню и покупки. Простая кухня под ваши цели.",
  applicationName: "FoodLab",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "FoodLab" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#173f33",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
