"use client";

import AddRounded from "@mui/icons-material/AddRounded";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import MenuRounded from "@mui/icons-material/MenuRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha, useColorScheme } from "@mui/material/styles";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useNotification } from "../../hooks/useNotification";
import { NotificationCenter } from "../notifications/NotificationCenter";
import { useData } from "../../lib/data";
import { CreatePaymentDialog } from "../payments/CreatePaymentDialog";
import { PaymentDrawer } from "../payments/PaymentDrawer";
import { StatusIndicator } from "../ui/StatusIndicator";
import { BrandIcon, isActive, NAV } from "./nav";

const FULL = 232, MINI = 60, BAR = 48;
const STORE = "payflow.sidebar";

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar disableGutters variant="dense" sx={{ px: 1.5, minHeight: BAR, justifyContent: collapsed ? "center" : "flex-start", borderBottom: 1, borderColor: "divider" }}>
        <Link href="/" aria-label="PayFlow home" onClick={onNavigate} style={{ display: "flex", width: collapsed ? "auto" : "100%" }}>
          {collapsed ? (
            <Box aria-hidden sx={{ width: 28, height: 28, borderRadius: 1, bgcolor: "primary.dark", color: "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}><BrandIcon sx={{ fontSize: 18 }} /></Box>
          ) : (
            // White wordmark sits on a dark plate to stay legible in light mode.
            <Box sx={{ bgcolor: "#0B1220", borderRadius: 1, px: 1, py: 0.25, display: "flex", alignItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="PayFlow Acceptance Solution" height={32} style={{ display: "block", height: 32, width: "auto" }} />
            </Box>
          )}
        </Link>
      </Toolbar>
      <Box component="nav" aria-label="Primary" sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", px: 1, py: 1 }}>
        {NAV.map((g) => {
          const open = !closed[g.group];
          const groupId = `nav-${g.group}`;
          return (
            <Box key={g.group} sx={{ mb: 0.5 }}>
              {collapsed ? <Divider sx={{ my: 1 }} /> : (
                <NavGroupHeader label={g.group} open={open} controls={groupId} onToggle={() => setClosed((c) => ({ ...c, [g.group]: open }))} />
              )}
              <Collapse in={collapsed || open} id={groupId} timeout={150}>
                <List dense disablePadding>
                  {g.items.map((item) => {
                    const active = isActive(item.href, path);
                    const Icon = item.icon;
                    return (
                      <Tooltip key={item.href} title={collapsed ? item.label : ""} placement="right">
                        <ListItemButton component={Link} href={item.href} selected={active} onClick={onNavigate} aria-current={active ? "page" : undefined} aria-label={collapsed ? item.label : undefined}
                          sx={(t) => ({ minHeight: 32, mb: 0.25, px: collapsed ? 0 : 1.25, justifyContent: collapsed ? "center" : "flex-start", color: "text.secondary",
                            "&:hover": { bgcolor: "action.hover", color: "text.primary" },
                            "&.Mui-selected": { bgcolor: alpha(t.palette.primary.main, 0.1), color: "primary.text", "&:hover": { bgcolor: alpha(t.palette.primary.main, 0.14) }, "& .MuiListItemIcon-root": { color: "primary.text" } } })}>
                          <ListItemIcon sx={{ minWidth: collapsed ? 0 : 30, color: "inherit" }}><Icon sx={{ fontSize: 18 }} /></ListItemIcon>
                          {!collapsed && <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: active ? 600 : 500, fontSize: "0.8125rem" } } }} />}
                        </ListItemButton>
                      </Tooltip>
                    );
                  })}
                </List>
              </Collapse>
            </Box>
          );
        })}
      </Box>
      {!collapsed && (
        <Box sx={{ m: 1, p: 1.25, borderRadius: 1, border: 1, borderColor: "divider", bgcolor: "action.hover" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.25 }}><ShieldOutlined sx={{ fontSize: 16 }} color="primary" /><Typography variant="label">Sandbox environment</Typography></Box>
          <Typography variant="meta" color="text.secondary">Simulated payments only. No real funds move.</Typography>
        </Box>
      )}
    </Box>
  );
}

function NavGroupHeader({ label, open, controls, onToggle }: { label: string; open: boolean; controls: string; onToggle: () => void }) {
  return (
    <ListItemButton onClick={onToggle} aria-expanded={open} aria-controls={controls} sx={{ minHeight: 28, px: 1.25, py: 0, color: "text.secondary" }}>
      <Typography variant="overline" sx={{ flex: 1 }}>{label}</Typography>
      <ExpandMoreRounded aria-hidden sx={{ fontSize: 16, transition: (t) => t.transitions.create("transform", { duration: 150 }), transform: open ? "none" : "rotate(-90deg)" }} />
    </ListItemButton>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { mode, setMode, systemMode } = useColorScheme();
  const { notify } = useNotification();
  const { query, setQuery, setCreateOpen, error, lastSync, live, pendingOps, refresh, refreshing } = useData();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileEl, setProfileEl] = useState<HTMLElement | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  useEffect(() => { fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.json()).then((d) => setLoginRequired(!!d.loginRequired)).catch(() => {}); }, []);
  const signOut = async () => { try { await fetch("/api/auth/logout", { method: "POST" }); } finally { window.location.assign("/login"); } };

  useEffect(() => { try { setCollapsed(localStorage.getItem(STORE) === "1"); } catch { /* storage unavailable */ } }, []);
  const toggleCollapsed = () => setCollapsed((c) => { try { localStorage.setItem(STORE, c ? "0" : "1"); } catch { /* ignore */ } return !c; });

  const resolved = mode === "system" ? systemMode : mode;
  const width = collapsed ? MINI : FULL;
  // Green only when the event stream is actually established; polling fallback is shown as such.
  const conn = live === "live" ? { tone: "success", label: "Live", tip: "Receiving live updates" } as const
    : error ? { tone: "error", label: "Offline", tip: "Cannot reach the API. Showing the last data received" } as const
    : live === "reconnecting" ? { tone: "warning", label: "Reconnecting…", tip: "Live updates interrupted; refreshing every 15 seconds" } as const
    : { tone: "neutral", label: "Connecting…", tip: "Establishing live updates" } as const;
  const synced = lastSync ? `Last synced ${new Date(lastSync).toLocaleTimeString("en-GB")}` : "Waiting for first response";

  return (
    <Box sx={{ display: "flex", minHeight: "100dvh" }}>
      <Box component="a" href="#main" sx={{ position: "absolute", left: -9999, "&:focus": { left: 16, top: 8, zIndex: 2000, bgcolor: "background.paper", p: 1.5, borderRadius: 1 } }}>Skip to content</Box>

      <Box sx={{ display: { xs: "none", lg: "block" }, width, flexShrink: 0, transition: (t) => t.transitions.create("width", { duration: 180 }) }}>
        <Drawer variant="permanent" open sx={{ "& .MuiDrawer-paper": { width, boxSizing: "border-box", borderRight: 1, borderColor: "divider", transition: (t) => t.transitions.create("width", { duration: 180 }), overflowX: "hidden" } }}>
          <SidebarContent collapsed={collapsed} />
        </Drawer>
      </Box>
      <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }} sx={{ display: { xs: "block", lg: "none" }, "& .MuiDrawer-paper": { width: FULL, maxWidth: "85vw" } }}>
        <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AppBar position="sticky" color="inherit" elevation={0} sx={{ bgcolor: "background.paper", borderBottom: 1, borderColor: "divider", color: "text.primary" }}>
          <Toolbar variant="dense" disableGutters sx={{ gap: { xs: 0.5, sm: 1 }, minHeight: { xs: 52, sm: BAR }, px: { xs: 1, sm: 2 } }}>
            <IconButton aria-label="Open navigation" onClick={() => setMobileOpen(true)} sx={{ display: { lg: "none" } }}><MenuRounded /></IconButton>
            {/* Below lg the sidebar is hidden, so the header carries the logo. White wordmark needs a dark plate. */}
            <Link href="/" aria-label="PayFlow home" style={{ display: "flex" }}>
              <Box sx={{ display: { xs: "flex", lg: "none" }, bgcolor: "#0B1220", borderRadius: 1, px: 0.75, py: 0.25 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="" height={28} style={{ display: "block", height: 28, width: "auto" }} />
              </Box>
            </Link>
            <Tooltip title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              <IconButton aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} onClick={toggleCollapsed} sx={{ display: { xs: "none", lg: "inline-flex" } }}>{collapsed ? <ChevronRightRounded /> : <ChevronLeftRounded />}</IconButton>
            </Tooltip>
            <TextField
              size="small" type="search" placeholder="Search payments…" value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") router.push("/payments"); }}
              slotProps={{ htmlInput: { "aria-label": "Search payments" }, input: { startAdornment: <InputAdornment position="start"><SearchRounded sx={{ fontSize: 18 }} /></InputAdornment> } }}
              sx={{ flex: 1, maxWidth: 360, "& .MuiOutlinedInput-root": { bgcolor: "background.default" }, "& .MuiOutlinedInput-notchedOutline": { borderColor: "transparent" } }}
            />
            <Box sx={{ flex: 1 }} />
            <Tooltip title={`${conn.tip}. ${synced}`}>
              <Box role="status" aria-label="Live updates" tabIndex={0} sx={{ display: "inline-flex", borderRadius: 1, px: 0.5, "& .MuiTypography-root": { position: { xs: "absolute", md: "static" }, width: { xs: 1, md: "auto" }, height: { xs: 1, md: "auto" }, overflow: { xs: "hidden", md: "visible" }, clipPath: { xs: "inset(50%)", md: "none" } } }}>
                <StatusIndicator tone={conn.tone} label={conn.label} />
              </Box>
            </Tooltip>
            {pendingOps > 0 && <Chip size="small" color="warning" variant="outlined" label={`${pendingOps} pending`} sx={{ display: { xs: "none", md: "inline-flex" } }} />}
            <Tooltip title="Refresh now">
              <span><IconButton aria-label="Refresh data" disabled={refreshing} onClick={() => void refresh()}><RefreshRounded fontSize="small" sx={{ "@media (prefers-reduced-motion: no-preference)": refreshing ? { animation: "pfspin 1s linear infinite", "@keyframes pfspin": { to: { transform: "rotate(360deg)" } } } : {} }} /></IconButton></span>
            </Tooltip>
            <Chip size="small" label="Sandbox" variant="outlined" sx={{ display: { xs: "none", md: "inline-flex" } }} />
            <Button variant="contained" size="small" startIcon={<AddRounded />} onClick={() => setCreateOpen(true)} sx={{ display: { xs: "none", sm: "inline-flex" }, whiteSpace: "nowrap" }}>New payment</Button>
            <Tooltip title={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              <IconButton aria-label="Toggle colour mode" onClick={() => { const next = resolved === "dark" ? "light" : "dark"; setMode(next); notify.info("Theme updated", { description: `${next === "dark" ? "Dark" : "Light"} theme is on.`, category: "account" }); }}>{resolved === "dark" ? <LightModeOutlined fontSize="small" /> : <DarkModeOutlined fontSize="small" />}</IconButton>
            </Tooltip>
            <NotificationCenter />
            <IconButton aria-label="Account menu" onClick={(e) => setProfileEl(e.currentTarget)} sx={{ p: 0.5 }}><Avatar sx={{ width: 28, height: 28, bgcolor: "primary.dark", color: "#fff", fontSize: "0.6875rem", fontWeight: 500 }}>PF</Avatar></IconButton>
          </Toolbar>
        </AppBar>

        <Menu anchorEl={profileEl} open={!!profileEl} onClose={() => setProfileEl(null)}>
          <Box sx={{ px: 2, py: 1 }}><Typography variant="subtitle2">Demo operator</Typography><Typography variant="body2" color="text.secondary">Acme Demo Store</Typography></Box>
          <Divider />
          <MenuItem component={Link} href="/settings" onClick={() => setProfileEl(null)}>Settings</MenuItem>
          <MenuItem component={Link} href="/developers" onClick={() => setProfileEl(null)}>API documentation</MenuItem>
          {loginRequired && <MenuItem onClick={() => { setProfileEl(null); void signOut(); }}>Sign out</MenuItem>}
          {loginRequired && <MenuItem onClick={() => { setProfileEl(null); void signOut(); }}>Sign out</MenuItem>}
        </Menu>

        <Box component="main" id="main" tabIndex={-1} sx={{ flex: 1, minWidth: 0, p: { xs: 1.5, sm: 2, lg: 2.5 }, maxWidth: 1680, width: "100%", mx: "auto", outline: "none" }}>{children}</Box>
      </Box>

      <CreatePaymentDialog />
      <PaymentDrawer />
    </Box>
  );
}
