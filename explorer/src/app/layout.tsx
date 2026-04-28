import type { Metadata, Viewport } from "next";
import { SettingsProvider } from "@/lib/settings";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://scan.wintg.network"),
  title: {
    default: "WINTG Scan — explorer officiel WINTG",
    template: "%s · WINTG Scan",
  },
  description:
    "Explorez les blocs, transactions, tokens et adresses sur la chaîne WINTG. Mainnet 2280 · Testnet 22800.",
  applicationName: "WINTG Scan",
  authors: [{ name: "WINTG Group" }],
  keywords: ["WINTG", "WTG", "blockchain", "explorer", "africa", "uemoa", "evm"],
  openGraph: {
    title: "WINTG Scan",
    description: "Explorateur officiel WINTG.",
    url: "https://scan.wintg.network",
    siteName: "WINTG Scan",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WINTG Scan",
    description: "Explorateur officiel WINTG.",
  },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#FF6A1A",
  width: "device-width",
  initialScale: 1,
};

// Block the FOUC by reading the saved theme before React hydrates.
const themeInitScript = `
(function () {
  try {
    var t = localStorage.getItem('wintg.scan.theme');
    var resolved = t === 'light' || t === 'dark'
      ? t
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = resolved;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
