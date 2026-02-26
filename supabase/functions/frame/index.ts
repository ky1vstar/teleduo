// ── Frame Edge Function ──────────────────────────────────────────────────────
// QR code generation and portal enrollment page. No Duo signature required.
// All paths prefixed with /frame (the function name).
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";

import { handleQr } from "./routes/qr.ts";
import { handlePortalEnroll } from "./routes/portalEnroll.ts";

const app = express();

app.get("/frame/qr", handleQr);
app.get("/frame/portal/v4/enroll", handlePortalEnroll);

app.listen(3000);
