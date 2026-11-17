import { alpha, createTheme } from "@mui/material/styles";

/**
 * PayFlow design tokens. Single source of truth for the data-dense dashboard language.
 * `main` colours are used for fills, icons and charts; `text` variants meet WCAG AA for small text.
 */
export const tokens = {
  text: "#1F2937", panel: "#FFFFFF", accent: "#2563EB", up: "#10B981", down: "#EF4444", warn: "#F59E0B",
  border: "#E5E7EB", canvas: "#F3F4F6", muted: "#6B7280",
  successText: "#047857", errorText: "#B91C1C", warningText: "#B45309", accentText: "#1D4ED8",
};

const font = '"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const mono = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
const tnum = { fontVariantNumeric: "tabular-nums" } as const;
/** Desktop type steps apply from the `md` breakpoint (900px); below it body text stays at 14px for legibility on touch devices. */
const md = "@media (min-width:900px)";
const MOTION = "120ms";

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "data" },
  defaultColorScheme: "light",
  colorSchemes: {
    light: {
      palette: {
        primary: { main: tokens.accent, dark: tokens.accentText, light: "#93C5FD", text: tokens.accentText, contrastText: "#FFFFFF" },
        secondary: { main: tokens.muted, text: "#4B5563" },
        info: { main: tokens.accent, text: tokens.accentText },
        success: { main: tokens.up, text: tokens.successText, contrastText: "#FFFFFF" },
        warning: { main: tokens.warn, text: tokens.warningText },
        error: { main: tokens.down, text: tokens.errorText },
        background: { default: tokens.canvas, paper: tokens.panel },
        text: { primary: tokens.text, secondary: "#4B5563", disabled: "#9CA3AF" },
        divider: tokens.border,
      },
    },
    dark: {
      palette: {
        primary: { main: "#60A5FA", dark: "#2563EB", light: "#93C5FD", text: "#93C5FD", contrastText: "#FFFFFF" },
        secondary: { main: "#9CA3AF", text: "#9CA3AF" },
        info: { main: "#60A5FA", text: "#93C5FD" },
        success: { main: "#34D399", text: "#6EE7B7" },
        warning: { main: "#FBBF24", text: "#FCD34D" },
        error: { main: "#F87171", text: "#FCA5A5" },
        background: { default: "#0B1220", paper: "#111827" },
        text: { primary: "#E5E7EB", secondary: "#9CA3AF", disabled: "#6B7280" },
        divider: "#1F2937",
      },
    },
  },
  shape: { borderRadius: 6 },
  spacing: 8,
  breakpoints: { values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1440 } },
  // Type scale. Weights: 400 body, 500 labels, 500-600 section titles, 600 page titles and KPI values. No 700.
  typography: {
    fontFamily: font,
    fontWeightRegular: 400, fontWeightMedium: 500, fontWeightBold: 600,
    h1: { fontSize: "1.375rem", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.25, [md]: { fontSize: "1.5rem" } },
    h2: { fontSize: "1rem", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.3 },
    h3: { fontSize: "0.875rem", fontWeight: 600, letterSpacing: "-0.005em", lineHeight: 1.35, [md]: { fontSize: "0.9375rem" } },
    h4: { fontSize: "0.8125rem", fontWeight: 500, lineHeight: 1.4, [md]: { fontSize: "0.875rem" } },
    subtitle1: { fontSize: "0.9375rem", fontWeight: 500, lineHeight: 1.45 },
    subtitle2: { fontSize: "0.8125rem", fontWeight: 500, lineHeight: 1.45 },
    body1: { fontSize: "0.9375rem", fontWeight: 400, lineHeight: 1.55, [md]: { fontSize: "0.875rem" } },
    body2: { fontSize: "0.875rem", fontWeight: 400, lineHeight: 1.5, [md]: { fontSize: "0.8125rem" } },
    lead: { fontSize: "0.875rem", fontWeight: 400, lineHeight: 1.6, maxWidth: "68ch" },
    metric: { fontSize: "1.375rem", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2, ...tnum },
    meta: { fontSize: "0.75rem", fontWeight: 400, lineHeight: 1.5, letterSpacing: "0.005em", ...tnum },
    caption: { fontSize: "0.75rem", fontWeight: 400, lineHeight: 1.5, letterSpacing: "0.005em" },
    label: { fontSize: "0.75rem", fontWeight: 500, lineHeight: 1.4, letterSpacing: "0.01em" },
    overline: { fontSize: "0.6875rem", fontWeight: 500, letterSpacing: "0.04em", lineHeight: 1.4, textTransform: "uppercase" },
    button: { fontSize: "0.8125rem", fontWeight: 500, letterSpacing: 0, textTransform: "none" },
    code: { fontFamily: mono, fontSize: "0.75rem", lineHeight: 1.6, fontWeight: 400 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: (t) => ({
        body: { fontFeatureSettings: '"cv11", "calt", "tnum" 0', WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale", fontOpticalSizing: "auto", textRendering: "optimizeLegibility", overflowX: "hidden" },
        "h1, h2, h3, h4": { textWrap: "balance", margin: 0 },
        "p, li": { textWrap: "pretty" },
        "code:not(pre code)": { fontFamily: mono, fontSize: "0.875em", padding: "0.1em 0.35em", borderRadius: 4, backgroundColor: t.vars!.palette.action.hover },
        // Visible keyboard focus everywhere, independent of component-level styles.
        ":focus-visible": { outline: `2px solid ${t.vars!.palette.primary.main}`, outlineOffset: 2 },
        "@media (prefers-reduced-motion: reduce)": { "*, *::before, *::after": { animationDuration: "0.01ms !important", animationIterationCount: "1 !important", transitionDuration: "0.01ms !important", scrollBehavior: "auto !important" } },
      }),
    },
    MuiTypography: {
      defaultProps: { variantMapping: { lead: "p", metric: "p", meta: "p", label: "span", code: "p", overline: "span" } },
      styleOverrides: { root: ({ ownerState: o, theme: t }) => ({ ...(o.variant === "lead" && { color: t.vars!.palette.text.secondary }) }) },
    },
    MuiLink: {
      defaultProps: { underline: "hover" },
      styleOverrides: { root: ({ theme: t }) => ({ color: t.vars!.palette.primary.text, fontWeight: 500, textUnderlineOffset: "0.22em", textDecorationThickness: "1px", borderRadius: 2 }) },
    },
    MuiInputLabel: { styleOverrides: { root: { fontSize: "0.8125rem", fontWeight: 500 } } },
    MuiFormHelperText: { styleOverrides: { root: { fontSize: "0.75rem", lineHeight: 1.45, marginTop: 4, marginLeft: 2 } } },
    MuiInputBase: { styleOverrides: { input: { fontSize: "0.875rem", "@media (max-width:599.95px)": { fontSize: "1rem" } } } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme: t }) => ({ borderRadius: 6, backgroundColor: t.vars!.palette.background.paper, "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: t.vars!.palette.text.disabled } }),
        input: { paddingTop: 7, paddingBottom: 7 },
      },
    },
    MuiSelect: { styleOverrides: { select: { fontSize: "0.8125rem" } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 6, padding: "2px 12px", alignItems: "center" }, message: { fontSize: "0.8125rem", lineHeight: 1.5, padding: "6px 0" }, action: { paddingTop: 0, alignItems: "center" } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 8 } } },
    MuiDialogTitle: { defaultProps: { variant: "h2" as never }, styleOverrides: { root: { padding: "16px 20px 8px" } } },
    MuiDialogContent: { styleOverrides: { root: { padding: "8px 20px 12px" } } },
    MuiDialogActions: { styleOverrides: { root: { padding: "8px 20px 16px", gap: 4 } } },
    MuiDialogContentText: { styleOverrides: { root: { fontSize: "0.8125rem", lineHeight: 1.55 } } },
    MuiTabs: { styleOverrides: { root: { minHeight: 36 } } },
    MuiTab: { styleOverrides: { root: { fontWeight: 500, fontSize: "0.8125rem", minHeight: 36, padding: "6px 12px" } } },
    MuiToggleButtonGroup: { styleOverrides: { root: { backgroundColor: "transparent" } } },
    MuiToggleButton: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          fontWeight: 500, fontSize: "0.75rem", textTransform: "none", padding: "4px 10px", lineHeight: 1.5, color: t.vars!.palette.text.secondary, borderColor: t.vars!.palette.divider,
          "&.Mui-selected": { color: t.vars!.palette.primary.text, backgroundColor: alpha(tokens.accent, 0.1), "&:hover": { backgroundColor: alpha(tokens.accent, 0.16) } },
        }),
      },
    },
    MuiListItemText: { styleOverrides: { primary: { fontSize: "0.8125rem" }, secondary: { fontSize: "0.75rem", lineHeight: 1.5 } } },
    MuiListSubheader: { styleOverrides: { root: { fontSize: "0.6875rem", fontWeight: 500, letterSpacing: "0.04em", lineHeight: "28px", textTransform: "uppercase" } } },
    MuiMenuItem: { styleOverrides: { root: { fontSize: "0.8125rem", minHeight: 36 } } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 6, minHeight: 32, padding: "4px 12px", transition: `background-color ${MOTION}, border-color ${MOTION}, color ${MOTION}`, "@media (max-width:599.95px)": { minHeight: 40 } },
        sizeSmall: { minHeight: 28, padding: "2px 8px", fontSize: "0.75rem" },
        sizeLarge: { minHeight: 40, fontSize: "0.875rem" },
      },
      variants: [
        // Filled primary buttons use primary.dark so label text passes AA in both schemes (white on #1D4ED8 light, white on #2563EB dark, 5.2:1).
        { props: { variant: "contained", color: "primary" }, style: ({ theme: t }) => ({ backgroundColor: t.vars!.palette.primary.dark, color: t.vars!.palette.primary.contrastText, "&:hover": { backgroundColor: t.vars!.palette.primary.dark, filter: "brightness(0.92)" } }) },
        { props: { variant: "outlined", color: "inherit" }, style: ({ theme: t }) => ({ borderColor: t.vars!.palette.divider, "&:hover": { borderColor: t.vars!.palette.text.disabled, backgroundColor: t.vars!.palette.action.hover } }) },
        { props: { variant: "text", color: "primary" }, style: ({ theme: t }) => ({ color: t.vars!.palette.primary.text }) },
      ],
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 6, transition: `background-color ${MOTION}`, "@media (max-width:599.95px)": { minWidth: 40, minHeight: 40 } }, sizeSmall: { padding: 4 } } },
    MuiCard: { defaultProps: { variant: "outlined" }, styleOverrides: { root: ({ theme: t }) => ({ borderRadius: 8, borderColor: t.vars!.palette.divider, backgroundImage: "none", boxShadow: "0 1px 1px rgba(16,24,40,0.03)" }) } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiDrawer: { styleOverrides: { paper: { backgroundImage: "none" } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 500, fontSize: "0.6875rem", borderRadius: 4, letterSpacing: "0.01em", height: 20, transition: `background-color ${MOTION}, color ${MOTION}` }, label: { padding: "0 6px" } } },
    MuiTooltip: { defaultProps: { arrow: false, enterDelay: 300 }, styleOverrides: { tooltip: { borderRadius: 4, fontSize: "0.75rem", fontWeight: 400, padding: "4px 8px", lineHeight: 1.45 } } },
    MuiSkeleton: { defaultProps: { animation: "wave" }, styleOverrides: { root: { borderRadius: 4 } } },
    MuiBreadcrumbs: { styleOverrides: { root: { fontSize: "0.75rem" }, separator: { marginLeft: 4, marginRight: 4 } } },
    MuiTableCell: {
      styleOverrides: {
        root: ({ theme: t }) => ({ fontSize: "0.8125rem", lineHeight: 1.4, fontVariantNumeric: "tabular-nums", borderBottom: `1px solid ${t.vars!.palette.divider}` }),
        sizeSmall: { padding: "6px 12px", "&:first-of-type": { paddingLeft: 16 }, "&:last-of-type": { paddingRight: 16 } },
        head: ({ theme: t }) => ({ fontWeight: 500, fontSize: "0.6875rem", letterSpacing: "0.03em", textTransform: "uppercase", color: t.vars!.palette.text.secondary, backgroundColor: t.vars!.palette.background.default, whiteSpace: "nowrap", lineHeight: 1.3 }),
      },
    },
    MuiTableRow: { styleOverrides: { root: ({ theme: t }) => ({ transition: `background-color ${MOTION}`, "&.Mui-selected": { backgroundColor: alpha(tokens.accent, 0.08) }, "&.Mui-selected:hover": { backgroundColor: alpha(tokens.accent, 0.12) }, "&.MuiTableRow-hover:hover": { backgroundColor: t.vars!.palette.action.hover } }) } },
    MuiTableSortLabel: { styleOverrides: { root: { "&.Mui-active": { color: "inherit" } }, icon: { fontSize: 14 } } },
    MuiTablePagination: { styleOverrides: { root: { fontSize: "0.75rem" }, toolbar: { minHeight: 44, paddingLeft: 12 }, selectLabel: { fontSize: "0.75rem", margin: 0 }, displayedRows: { fontSize: "0.75rem", margin: 0, fontVariantNumeric: "tabular-nums" }, select: { fontSize: "0.75rem" } } },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: 6, transition: `background-color ${MOTION}, color ${MOTION}` } } },
  },
});
