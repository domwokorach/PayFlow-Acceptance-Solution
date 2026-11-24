"use client";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState, type FormEvent } from "react";

/** Only same-site relative paths are honoured, so the form can never bounce a signed-in user to another site. */
export const safeNext = (next: string | null) => (next && /^\/(?!\/|\\)[\w\-./]*$/.test(next) && !next.startsWith("/login") && !next.startsWith("/api") ? next : "/");

export function LoginForm() {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) });
      if (res.ok) { window.location.assign(safeNext(new URLSearchParams(window.location.search).get("next"))); return; }
      const data = await res.json().catch(() => ({}));
      setError(data.error || `Sign-in failed (${res.status})`);
    } catch { setError("Cannot reach PayFlow. Check your connection and try again."); }
    setBusy(false);
  }

  return (
    <Box component="main" sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: 2 }}>
      <Paper variant="outlined" sx={{ width: "100%", maxWidth: 380, p: { xs: 2.5, sm: 3 } }}>
        <Box sx={{ bgcolor: "#0B1220", borderRadius: 1, px: 1.5, py: 0.75, display: "inline-flex", mb: 2 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="PayFlow Acceptance Solution" height={36} style={{ display: "block", height: 36, width: "auto" }} />
        </Box>
        <Typography variant="h1" component="h1" sx={{ fontSize: "1.25rem", mb: 0.5 }}>Sign in</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>PayFlow operator access. Sandbox payments only.</Typography>
        <Box component="form" onSubmit={submit} noValidate sx={{ display: "grid", gap: 1.5 }}>
          {error && <Alert severity="error" role="alert">{error}</Alert>}
          <TextField name="username" label="Username" autoComplete="username" required autoFocus fullWidth size="small" />
          <TextField name="password" label="Password" type="password" autoComplete="current-password" required fullWidth size="small" />
          <Button type="submit" variant="contained" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        </Box>
      </Paper>
    </Box>
  );
}
