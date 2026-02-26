import type { Request, Response } from "express";
import QRCode from "qrcode";

export async function handleQr(req: Request, res: Response) {
  try {
    const value = req.query.value;
    if (!value) {
      return res.status(400).json({
        stat: "FAIL",
        code: 40001,
        message: "Missing required request parameters",
        message_detail: "value",
      });
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
    console.error("QR generation error", err);
    res
      .status(500)
      .json({ stat: "FAIL", code: 50000, message: "Internal server error" });
  }
}
