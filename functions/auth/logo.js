const logger = require("firebase-functions/logger");
const { LOGO_URL } = require("../config");
const { duoError } = require("../helpers");

/**
 * GET /auth/v2/logo
 * Proxy the logo image from LOGO_URL config, or return 404.
 */
async function handleLogo(req, res) {
  try {
    const logoUrl = LOGO_URL.value();

    if (!logoUrl) {
      return duoError(res, 40401, "Resource not found");
    }

    // Fetch and proxy the logo
    const response = await fetch(logoUrl);

    if (!response.ok) {
      return duoError(res, 40401, "Resource not found");
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  } catch (err) {
    logger.error("logo error", err);
    duoError(res, 50000, "Internal server error");
  }
}

module.exports = { handleLogo };
