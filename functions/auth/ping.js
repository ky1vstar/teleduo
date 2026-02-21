const { duoSuccess } = require("../helpers");

/**
 * GET /auth/v2/ping
 * Liveness check. No signature verification required.
 */
function handlePing(req, res) {
  duoSuccess(res, { time: Math.floor(Date.now() / 1000) });
}

module.exports = { handlePing };
