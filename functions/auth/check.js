const { duoSuccess } = require("../helpers");

/**
 * GET /auth/v2/check
 * Verifies signature validity (middleware already did that) and returns time.
 */
function handleCheck(req, res) {
  duoSuccess(res, { time: Math.floor(Date.now() / 1000) });
}

module.exports = { handleCheck };
