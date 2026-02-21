const logger = require("firebase-functions/logger");
const crypto = require("crypto");
const { auth, db } = require("../firebaseInit");
const { extractParams, extractUsername, resolveEmail, duoError, duoSuccess } = require("../helpers");

/**
 * Create a portal enrollment record and return the enroll_portal_url.
 * The URL is valid for 5 minutes. Reuses existing unexpired portal enrollment if present.
 */
async function buildEnrollPortalResponse(req, username) {
  // Check for an existing unexpired portal enrollment for this username
  const existing = await db.collection("portal_enrollments")
    .where("username", "==", username)
    .where("expiresAt", ">", new Date())
    .limit(1)
    .get();

  let code;
  if (!existing.empty) {
    code = existing.docs[0].id;
  } else {
    code = crypto.randomBytes(24).toString("base64url");
    await db.collection("portal_enrollments").doc(code).set({
      username,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      createdAt: new Date(),
    });
  }

  const cfHost = req.headers["host"] || req.hostname;
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const enrollPortalUrl = `${protocol}://${cfHost}/frame/portal/v4/enroll?code=${code}`;

  return {
    enroll_portal_url: enrollPortalUrl,
    result: "enroll",
    status_msg: "Enroll an authentication device to proceed",
  };
}

/**
 * POST /auth/v2/preauth
 * Determine if user is authorized to log in and return available factors.
 */
async function handlePreauth(req, res) {
  try {
    const params = extractParams(req);
    const userId = params.user_id || null;
    const username = params.username || null;

    if (!userId && !username) {
      return duoError(res, 40001, "Missing required request parameters", "user_id or username");
    }

    let firebaseUid = userId;

    // Look up user by username if user_id not provided
    if (!firebaseUid && username) {
      try {
        const email = resolveEmail(username);
        const userRecord = await auth.getUserByEmail(email);
        firebaseUid = userRecord.uid;
      } catch (err) {
        if (err.code === "auth/user-not-found") {
          // User not found — return enroll with portal URL
          const enrollResp = await buildEnrollPortalResponse(req, username);
          return duoSuccess(res, enrollResp);
        }
        throw err;
      }
    }

    // Check if user exists in Firebase Auth
    try {
      await auth.getUser(firebaseUid);
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        const uname = username || firebaseUid;
        const enrollResp = await buildEnrollPortalResponse(req, uname);
        return duoSuccess(res, enrollResp);
      }
      throw err;
    }

    // Get user document from Firestore
    const userDoc = await db.collection("users").doc(firebaseUid).get();

    if (!userDoc.exists) {
      const uname = username || extractUsername(firebaseUid);
      const enrollResp = await buildEnrollPortalResponse(req, uname);
      return duoSuccess(res, enrollResp);
    }

    const userData = userDoc.data();

    // Check user status
    if (userData.status === "bypass") {
      return duoSuccess(res, {
        result: "allow",
        status_msg: "Bypassing authentication",
      });
    }

    if (userData.status === "disabled") {
      return duoSuccess(res, {
        result: "deny",
        status_msg: "Account is disabled",
      });
    }

    // status == "active" — check for devices
    const devicesSnap = await db
      .collection("users")
      .doc(firebaseUid)
      .collection("devices")
      .get();

    if (devicesSnap.empty) {
      const uname = username || extractUsername(firebaseUid);
      const enrollResp = await buildEnrollPortalResponse(req, uname);
      return duoSuccess(res, enrollResp);
    }

    // Build devices list
    const devices = [];
    devicesSnap.forEach((doc) => {
      const d = doc.data();
      devices.push({
        device: doc.id,
        display_name: d.displayName || "Telegram",
        name: d.name || "Telegram",
        number: "",
        type: d.type || "phone",
        capabilities: ["auto", "push"],
      });
    });

    duoSuccess(res, {
      result: "auth",
      status_msg: "Account is active",
      devices,
    });
  } catch (err) {
    logger.error("preauth error", err);
    duoError(res, 50000, "Internal server error");
  }
}

module.exports = { handlePreauth };
