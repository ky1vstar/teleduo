const logger = require("firebase-functions/logger");
const { auth, db } = require("../firebaseInit");
const { sendPushMessage } = require("../telegram/bot");
const { t } = require("../telegram/i18n");
const {
  extractParams,
  resolveEmail,
  generateTxId,
  duoError,
  duoSuccess,
} = require("../helpers");

// ── Firestore long-poll helper ───────────────────────────────────────────────

async function waitForAuthResult(txid, timeoutMs = 60000) {
  const docRef = db.collection("auth_transactions").doc(txid);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      docRef.update({
        result: "deny",
        status: "timeout",
        statusMsg: "Login timed out.",
        resolvedAt: new Date(),
      }).catch(() => {});
      resolve({ result: "deny", status: "timeout", status_msg: "Login timed out." });
    }, timeoutMs);

    const unsubscribe = docRef.onSnapshot((snap) => {
      const data = snap.data();
      if (data && data.result !== "waiting") {
        clearTimeout(timer);
        unsubscribe();
        resolve({
          result: data.result,
          status: data.status,
          status_msg: data.statusMsg,
        });
      }
    });
  });
}

// ── Resolve user + device ────────────────────────────────────────────────────

async function resolveUserAndDevice(params) {
  const userId = params.user_id || null;
  const username = params.username || null;

  if (!userId && !username) {
    return { error: { code: 40001, message: "Missing required request parameters", detail: "user_id or username" } };
  }

  let firebaseUid = userId;

  if (!firebaseUid && username) {
    try {
      const email = resolveEmail(username);
      const userRecord = await auth.getUserByEmail(email);
      firebaseUid = userRecord.uid;
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        return { error: { code: 40401, message: "Resource not found" } };
      }
      throw err;
    }
  }

  // Verify user exists in Firebase Auth
  let userRecord;
  try {
    userRecord = await auth.getUser(firebaseUid);
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      return { error: { code: 40401, message: "Resource not found" } };
    }
    throw err;
  }

  // Get user doc
  const userDoc = await db.collection("users").doc(firebaseUid).get();
  if (!userDoc.exists) {
    return { error: { code: 40401, message: "Resource not found" } };
  }

  // Find device
  const deviceParam = params.device || "auto";
  let deviceDoc = null;

  if (deviceParam === "auto") {
    const devicesSnap = await db
      .collection("users")
      .doc(firebaseUid)
      .collection("devices")
      .limit(1)
      .get();
    if (!devicesSnap.empty) {
      deviceDoc = devicesSnap.docs[0];
    }
  } else {
    const dSnap = await db
      .collection("users")
      .doc(firebaseUid)
      .collection("devices")
      .doc(deviceParam)
      .get();
    if (dSnap.exists) {
      deviceDoc = dSnap;
    }
  }

  if (!deviceDoc) {
    return { error: { code: 40002, message: "Invalid request parameters", detail: "no capable device" } };
  }

  return {
    uid: firebaseUid,
    userRecord,
    userData: userDoc.data(),
    deviceId: deviceDoc.id,
    deviceData: deviceDoc.data(),
  };
}

// ── Format push message ─────────────────────────────────────────────────────

function formatPushMessage(params, username, locale = "en") {
  const displayUsername = params.display_username || username;
  const pushinfo = params.pushinfo || "";
  const ipaddr = params.ipaddr || "unknown";
  const now = new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";

  // Parse pushinfo (URL-encoded key=value pairs)
  let domain = "";
  let type = "";
  if (pushinfo) {
    const parts = new URLSearchParams(pushinfo);
    domain = parts.get("domain") || "";
    type = parts.get("type") || "";
  }

  let text = t(locale, "push-title") + "\n\n" + t(locale, "push-user", { username: displayUsername });
  if (type) text += "\n" + t(locale, "push-app", { type });
  if (domain) text += "\n" + t(locale, "push-domain", { domain });
  text += "\n" + t(locale, "push-ip", { ipaddr });
  text += "\n" + t(locale, "push-time", { time: now });

  return text;
}

// ── Main handler ─────────────────────────────────────────────────────────────

/**
 * POST /auth/v2/auth
 * Perform second-factor authentication.
 */
async function handleAuth(req, res) {
  try {
    const params = extractParams(req);
    const factor = params.factor;

    if (!factor) {
      return duoError(res, 40001, "Missing required request parameters", "factor");
    }

    // Only push/auto supported in MVP
    if (factor !== "push" && factor !== "auto") {
      return duoError(res, 40002, "Invalid request parameters", `Unsupported factor: ${factor}`);
    }

    const resolved = await resolveUserAndDevice(params);
    if (resolved.error) {
      const e = resolved.error;
      return duoError(res, e.code, e.message, e.detail);
    }

    const { uid, userRecord, userData, deviceId, deviceData } = resolved;

    // Check user status
    if (userData.status === "bypass") {
      return duoSuccess(res, {
        result: "allow",
        status: "bypass",
        status_msg: "Bypassing authentication",
      });
    }
    if (userData.status === "disabled") {
      return duoSuccess(res, {
        result: "deny",
        status: "deny",
        status_msg: "Account is disabled",
      });
    }

    const isAsync = params.async === "1";
    const txid = generateTxId();
    const username = params.username || (userRecord.email ? userRecord.email.replace("@teleduo.local", "") : uid);

    // Create auth transaction
    const txData = {
      userId: uid,
      deviceId,
      factor,
      status: "pushed",
      statusMsg: "Pushed a login request to your phone...",
      result: "waiting",
      pushInfo: params.pushinfo ? Object.fromEntries(new URLSearchParams(params.pushinfo)) : {},
      displayUsername: params.display_username || username,
      ipaddr: params.ipaddr || "",
      telegramMessageId: null,
      telegramChatId: deviceData.telegramChatId || null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
      resolvedAt: null,
    };

    await db.collection("auth_transactions").doc(txid).set(txData);

    // Send Telegram push message
    const chatId = deviceData.telegramChatId;
    if (chatId) {
      const locale = deviceData.locale || "en";
      const text = formatPushMessage(params, username, locale);
      try {
        const messageId = await sendPushMessage(chatId, text, txid, locale);
        await db.collection("auth_transactions").doc(txid).update({
          telegramMessageId: messageId,
        });
      } catch (err) {
        logger.error("Failed to send Telegram push", err);
      }
    }

    // Async mode — return txid immediately
    if (isAsync) {
      return duoSuccess(res, { txid });
    }

    // Sync mode — wait for result
    const result = await waitForAuthResult(txid, 60000);
    duoSuccess(res, result);
  } catch (err) {
    logger.error("auth error", err);
    duoError(res, 50000, "Internal server error");
  }
}

module.exports = { handleAuth };
