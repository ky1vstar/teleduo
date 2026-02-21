const logger = require("firebase-functions/logger");
const { auth, db } = require("../firebaseInit");
const { ENROLL_ALLOW_EXISTING } = require("../config");
const { getBotUsername } = require("../telegram/bot");
const {
  generateActivationCode,
  generateRandomUsername,
  resolveEmail,
  extractUsername,
  extractParams,
  duoError,
  duoSuccess,
} = require("../helpers");

/**
 * POST /auth/v2/enroll
 * Enroll a new user. Creates Firebase Auth user + Firestore records.
 */
async function handleEnroll(req, res) {
  try {
    const params = extractParams(req);
    let username = params.username || null;
    const validSecs = parseInt(params.valid_secs, 10) || 86400;
    const allowExisting = ENROLL_ALLOW_EXISTING.value();

    // Generate random username if not provided
    if (!username) {
      username = generateRandomUsername();
    }

    const email = resolveEmail(username);
    let userId = null;
    let existingUser = false;

    // Check if user already exists
    try {
      const userRecord = await auth.getUserByEmail(email);
      userId = userRecord.uid;
      existingUser = true;

      if (!allowExisting) {
        return duoError(res, 40002, "Invalid request parameters", "username already exists");
      }

      // Delete existing devices for re-enrollment
      const devicesSnap = await db
        .collection("users")
        .doc(userId)
        .collection("devices")
        .get();
      const batch = db.batch();
      devicesSnap.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    } catch (err) {
      if (err.code !== "auth/user-not-found") {
        throw err;
      }
    }

    // Create user in Firebase Auth if not existing
    if (!existingUser) {
      const userRecord = await auth.createUser({ email });
      userId = userRecord.uid;
    }

    // Create/update user document in Firestore
    await db
      .collection("users")
      .doc(userId)
      .set(
        {
          status: "active",
          createdAt: new Date(),
        },
        { merge: true }
      );

    // Generate activation code
    const activationCode = generateActivationCode();
    const expiresAt = new Date(Date.now() + validSecs * 1000);

    // Get bot username for deep link
    const botUsername = await getBotUsername();
    const activationUrl = `https://t.me/${botUsername}?start=${activationCode}`;

    // Create enrollment document
    await db.collection("enrollments").doc(activationCode).set({
      userId,
      username,
      activationCode,
      status: "waiting",
      expiresAt,
      createdAt: new Date(),
    });

    // Build QR barcode URL
    const cfHost = req.headers["host"] || req.hostname;
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const barcodeUrl = `${protocol}://${cfHost}/frame/qr?value=${encodeURIComponent(activationUrl)}`;

    const expiration = Math.floor(expiresAt.getTime() / 1000);

    duoSuccess(res, {
      activation_barcode: barcodeUrl,
      activation_code: activationUrl,
      activation_url: activationUrl,
      expiration,
      user_id: userId,
      username,
    });
  } catch (err) {
    logger.error("enroll error", err);
    duoError(res, 50000, "Internal server error");
  }
}

module.exports = { handleEnroll };
