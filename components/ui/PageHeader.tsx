"use client";
import NavigateNextRounded from "@mui/icons-material/NavigateNextRounded";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV } from "../shell/nav";

/** Page title row: breadcrumbs (derived from the nav), H1, optional description and page actions. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const path = usePathname();
  const group = NAV.find((g) => g.items.some((i) => i.href === path))?.group;
  return (
    <Box sx={{ mb: 2 }}>
      <Breadcrumbs aria-label="Breadcrumb" separator={<NavigateNextRounded sx={{ fontSize: 14 }} />} sx={{ mb: 0.5, color: "text.secondary" }}>
        <Link component={NextLink} href="/" color="inherit" underline="hover" sx={{ fontWeight: 400 }}>PayFlow</Link>
        {group && path !== "/" ? <Typography variant="meta" color="text.secondary">{group}</Typography> : null}
        <Typography variant="meta" color="text.primary" aria-current="page">{title}</Typography>
      </Breadcrumbs>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h1" component="h1">{title}</Typography>
          {subtitle ? <Typography variant="lead" sx={{ mt: 0.25 }}>{subtitle}</Typography> : null}
        </Box>
        {actions ? <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", "@media (max-width:599.95px)": { "& > .MuiButton-contained": { flex: 1 } } }}>{actions}</Stack> : null}
      </Stack>
    </Box>
  );
}
