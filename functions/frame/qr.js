const QRCode = require("qrcode");
const logger = require("firebase-functions/logger");

/**
 * GET /frame/qr?value=<string>
 * Generate a QR code PNG 225×225. No signature verification.
 */
async function handleQr(req, res) {
  try {
    const value = req.query.value;

    if (!value) {
      res.status(400).json({
        stat: "FAIL",
        code: 40001,
        message: "Missing required request parameters",
        message_detail: "value",
      });
      return;
    }

    const buffer = await QRCode.toBuffer(value, {
      type: "png",
      width: 225,
      margin: 1,
    });

    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  } catch (err) {
    logger.error("QR generation error", err);
    res.status(500).json({
      stat: "FAIL",
      code: 50000,
      message: "Internal server error",
    });
  }
}

module.exports = { handleQr };
