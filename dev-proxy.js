const http = require("http");

// ── Configuration ────────────────────────────────────────────────────────────

const PROXY_PORT = 3000;
const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_PORT = 5001;
const PROJECT_ID = "teleduo-9cc0f";
const REGION = "us-central1";

// Maps /auth/* and /admin/* to the emulator's full function path
const PREFIXES = ["auth", "admin"];

// ── Proxy server ─────────────────────────────────────────────────────────────

const server = http.createServer((clientReq, clientRes) => {
  const match = clientReq.url.match(/^\/(auth|admin)(\/.*)?$/);

  if (!match) {
    clientRes.writeHead(404, { "Content-Type": "application/json" });
    clientRes.end(JSON.stringify({ error: "Unknown route. Expected /auth or /admin." }));
    return;
  }

  const funcName = match[1]; // "auth" or "admin"
  const rest = match[2] || ""; // e.g. "/v2/ping"

  // Rewrite path: /auth/v2/ping → /teleduo-9cc0f/us-central1/auth/v2/ping
  const targetPath = `/${PROJECT_ID}/${REGION}/${funcName}${rest}`;

  console.log(`[proxy] ${clientReq.method} ${clientReq.url} → ${targetPath}`);

  const proxyReq = http.request(
    {
      hostname: EMULATOR_HOST,
      port: EMULATOR_PORT,
      path: targetPath,
      method: clientReq.method,
      headers: {
        ...clientReq.headers,
        // Keep the original Host header so signature verification works
        host: clientReq.headers.host,
      },
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes);
    }
  );

  proxyReq.on("error", (err) => {
    console.error("[proxy] Error:", err.message);
    clientRes.writeHead(502, { "Content-Type": "application/json" });
    clientRes.end(JSON.stringify({ error: `Emulator unreachable: ${err.message}` }));
  });

  clientReq.pipe(proxyReq);
});

server.listen(PROXY_PORT, () => {
  console.log(`Dev proxy listening on http://127.0.0.1:${PROXY_PORT}`);
  console.log(`  /auth/*  → http://${EMULATOR_HOST}:${EMULATOR_PORT}/${PROJECT_ID}/${REGION}/auth/*`);
  console.log(`  /admin/* → http://${EMULATOR_HOST}:${EMULATOR_PORT}/${PROJECT_ID}/${REGION}/admin/*`);
});
