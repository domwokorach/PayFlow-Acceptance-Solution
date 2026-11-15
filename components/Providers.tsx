"use client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import type { ReactNode } from "react";
import { DataProvider } from "../lib/data";
import { theme } from "../lib/theme";
import { NotificationProvider } from "./notifications/NotificationProvider";

export function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={theme} defaultMode="system"><CssBaseline enableColorScheme /><NotificationProvider><DataProvider>{children}</DataProvider></NotificationProvider></ThemeProvider>;
}
