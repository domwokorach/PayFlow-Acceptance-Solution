import "@fontsource-variable/inter";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import type { Metadata, Viewport } from "next";
import { Providers } from "../components/Providers";
import { AppShell } from "../components/shell/AppShell";

export const metadata: Metadata = {
  title: { template: "%s · PayFlow", default: "Overview · PayFlow" }, // each route sets its own title in its layout.tsx
  description: "Simulated fintech processing dashboard — engineering portfolio",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <InitColorSchemeScript attribute="data" defaultMode="system" />
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <Providers><AppShell>{children}</AppShell></Providers>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
