import type { Metadata } from "next";
import type { ReactNode } from "react";

// Pages are client components, so the title lives in this server layout.
export const metadata: Metadata = { title: "Payments" };
export default function Layout({ children }: { children: ReactNode }) { return children; }
