require("dotenv").config();

const http = require("http");
const querystring = require("querystring");
const duo_api = require("@duosecurity/duo_api");

const PORT = process.env.PORT || 3000;

// ── Duo clients ──────────────────────────────────────────────────────────────

const authClient = new duo_api.Client(
  process.env.AUTH_IKEY,
  process.env.AUTH_SKEY,
  process.env.DUO_HOST
);

const adminClient = new duo_api.Client(
  process.env.ADMIN_IKEY,
  process.env.ADMIN_SKEY,
  process.env.DUO_HOST
);

// Map prefix to its Duo client
const ROUTE_MAP = {
  "/auth": authClient,
  "/admin": adminClient,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

// Generate a short unique id for correlating request / response logs
let reqCounter = 0;
function nextReqId() {
  return `req-${++reqCounter}`;
}

// Pretty-print a JSON body (or return raw string if not JSON)
function prettyBody(raw) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

// Collect the full request body from an IncomingMessage
function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// Parse multipart/form-data body into a plain key-value object.
// Handles only simple text fields (no file uploads), which is sufficient
// for Duo API params.
function parseMultipart(rawBody, boundary) {
  const params = {};
  // Each part is separated by --boundary
  const parts = rawBody.split(`--${boundary}`);
  for (const part of parts) {
    // Skip preamble and closing delimiter
    if (!part || part.trim() === "--" || part.trim() === "") continue;

    // Split headers from value by the first empty line (\r\n\r\n)
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const headerSection = part.substring(0, headerEnd);
    // Value sits between the empty line and the trailing \r\n before next boundary
    const value = part.substring(headerEnd + 4).replace(/\r\n$/, "");

    // Extract field name from Content-Disposition header
    const nameMatch = headerSection.match(/name="([^"]+)"/);
    if (nameMatch) {
      params[nameMatch[1]] = value;
    }
  }
  return params;
}

// ── Request handler ──────────────────────────────────────────────────────────

async function handleRequest(req, res) {
  const reqId = nextReqId();
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method.toUpperCase();
  const fullPath = parsed.pathname; // e.g. /admin/v1/users/bulk_create

  // ── Determine which client to use based on the first path segment ──────
  const prefix = "/" + (fullPath.split("/")[1] || ""); // "/auth" or "/admin"
  const client = ROUTE_MAP[prefix];

  if (!client) {
    const msg = `Unknown route prefix: ${prefix}. Expected /auth or /admin.`;
    console.log(`[${reqId}] 404 – ${msg}`);
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: msg }));
    return;
  }

  // The Duo API path is the full path as-is (e.g. /admin/v1/users)
  const duoPath = fullPath;

  // ── Collect params ─────────────────────────────────────────────────────
  let params = {};
  const rawBody = await collectBody(req);

  if (["POST", "PUT", "PATCH"].includes(method)) {
    const ct = (req.headers["content-type"] || "").toLowerCase();
    if (ct.includes("application/json")) {
      try {
        params = JSON.parse(rawBody);
      } catch {
        params = {};
      }
    } else if (ct.includes("multipart/form-data")) {
      // Extract boundary from Content-Type header
      const boundaryMatch = (req.headers["content-type"] || "").match(
        /boundary=(.+)/i
      );
      if (boundaryMatch) {
        params = parseMultipart(rawBody, boundaryMatch[1]);
      }
    } else {
      // Default: application/x-www-form-urlencoded
      params = querystring.parse(rawBody);
    }
  } else {
    // GET / DELETE – params from query string
    params = Object.fromEntries(parsed.searchParams);
  }

  // ── Log incoming request ───────────────────────────────────────────────
  console.log("═".repeat(80));
  console.log(`[${reqId}] >>> INCOMING REQUEST`);
  console.log(`[${reqId}]  Method : ${method}`);
  console.log(`[${reqId}]  URL    : ${req.url}`);
  console.log(`[${reqId}]  Headers: ${JSON.stringify(req.headers, null, 2)}`);
  console.log(`[${reqId}]  Duo path  : ${duoPath}`);
  console.log(`[${reqId}]  Duo params: ${JSON.stringify(params, null, 2)}`);
  if (rawBody) {
    console.log(`[${reqId}]  Raw body  : ${rawBody}`);
  }

  // ── Forward to Duo ─────────────────────────────────────────────────────
  client.jsonApiCall(method, duoPath, params, (duoResponse) => {
    // ── Log Duo response ─────────────────────────────────────────────────
    const responseStr = JSON.stringify(duoResponse, null, 2);
    console.log("─".repeat(80));
    console.log(`[${reqId}] <<< DUO RESPONSE`);
    console.log(`[${reqId}]  ${responseStr}`);
    console.log("═".repeat(80));

    // ── Forward response back to the caller ──────────────────────────────
    const statusCode = duoResponse.stat === "OK" ? 200 : 400;
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(duoResponse));
  });
}

// ── Start server ─────────────────────────────────────────────────────────────

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`Duo proxy server listening on http://localhost:${PORT}`);
  console.log(`  /auth/*  → Auth API  (ikey: ${process.env.AUTH_IKEY})`);
  console.log(`  /admin/* → Admin API (ikey: ${process.env.ADMIN_IKEY})`);
});
