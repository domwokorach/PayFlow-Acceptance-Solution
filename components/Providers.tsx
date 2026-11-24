"use client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DataProvider } from "../lib/data";
import { theme } from "../lib/theme";
import { AppShell } from "./shell/AppShell";
import { NotificationProvider } from "./notifications/NotificationProvider";

/** The sign-in page renders bare: no shell, no data fetching, so nothing calls the API before a session exists. */
export function Providers({ children }: { children: ReactNode }) {
  const bare = usePathname() === "/login";
  return <ThemeProvider theme={theme} defaultMode="system"><CssBaseline enableColorScheme /><NotificationProvider>{bare ? children : <DataProvider><AppShell>{children}</AppShell></DataProvider>}</NotificationProvider></ThemeProvider>;
}
