const logger = require("firebase-functions/logger");
const { auth, db } = require("../firebaseInit");
const { getBotUsername } = require("../telegram/bot");
const { generateActivationCode, resolveEmail } = require("../helpers");

// Expired page — plain English, no localization needed (matches Duo behavior)
const EXPIRED_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Enrollment link expired</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}
.card{background:#fff;border-radius:8px;padding:40px;max-width:420px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.1)}
h1{font-size:22px;margin:0 0 12px}p{color:#666;margin:0}</style></head>
<body><div class="card"><h1>Enrollment link expired</h1>
<p>Your enrollment link sent by email has expired. Contact your IT help desk for a new link.</p></div></body></html>`;

/**
 * GET /frame/portal/v4/enroll?code=<code>
 *
 * Portal enrollment page. When a user visits:
 * 1. Validates the code and checks expiry
 * 2. Creates Firebase Auth user + Firestore user doc if needed
 * 3. Creates an enrollment (activation code) if one doesn't exist yet
 * 4. Redirects to t.me deep link for Telegram bot activation
 */
async function handlePortalEnroll(req, res) {
  try {
    const code = req.query.code;
    if (!code) {
      return res.status(400).send("Missing code parameter");
    }

    // Look up portal enrollment
    const portalRef = db.collection("portal_enrollments").doc(code);
    const portalDoc = await portalRef.get();

    if (!portalDoc.exists) {
      return res.status(200).send(EXPIRED_HTML);
    }

    const portalData = portalDoc.data();

    // Check expiration
    if (portalData.expiresAt && portalData.expiresAt.toDate() < new Date()) {
      return res.status(200).send(EXPIRED_HTML);
    }

    const username = portalData.username;
    const email = resolveEmail(username);

    // If we already created an enrollment for this portal code, just redirect again
    if (portalData.activationUrl) {
      return res.redirect(302, portalData.activationUrl);
    }

    // Create or find Firebase Auth user
    let userId;
    try {
      const userRecord = await auth.getUserByEmail(email);
      userId = userRecord.uid;
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        const userRecord = await auth.createUser({ email });
        userId = userRecord.uid;
      } else {
        throw err;
      }
    }

    // Create/update user document in Firestore
    await db
      .collection("users")
      .doc(userId)
      .set({ status: "active", createdAt: new Date() }, { merge: true });

    // Generate activation code and enrollment
    const activationCode = generateActivationCode();
    const botUsername = await getBotUsername();
    const activationUrl = `https://t.me/${botUsername}?start=${activationCode}`;

    // Enrollment valid for same duration as the portal link
    await db.collection("enrollments").doc(activationCode).set({
      userId,
      username,
      activationCode,
      status: "waiting",
      expiresAt: portalData.expiresAt,
      createdAt: new Date(),
    });

    // Save activation URL on portal doc so repeat visits reuse the same enrollment
    await portalRef.update({ activationUrl, userId });

    logger.info("Portal enrollment created", { code, username, userId });

    // Redirect to Telegram bot
    res.redirect(302, activationUrl);
  } catch (err) {
    logger.error("Portal enrollment error", err);
    res.status(500).send("Internal server error");
  }
}

module.exports = { handlePortalEnroll };
