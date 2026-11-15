import "@mui/material/styles";

// PayFlow design-system extensions (defined in lib/theme.ts).
declare module "@mui/material/styles" {
  interface TypographyVariants { lead: React.CSSProperties; metric: React.CSSProperties; meta: React.CSSProperties; label: React.CSSProperties; code: React.CSSProperties }
  interface TypographyVariantsOptions { lead?: React.CSSProperties; metric?: React.CSSProperties; meta?: React.CSSProperties; label?: React.CSSProperties; code?: React.CSSProperties }
  /** `text` is the AA-contrast variant of a semantic colour, for small text on panels. `main` is for fills, icons and charts. */
  interface PaletteColor { text: string }
  interface SimplePaletteColorOptions { text?: string }
}
declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides { lead: true; metric: true; meta: true; label: true; code: true }
}
