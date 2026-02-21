const logger = require("firebase-functions/logger");
const { db } = require("../firebaseInit");
const { extractParams, duoError, duoSuccess } = require("../helpers");

/**
 * GET /auth/v2/auth_status
 * Long-poll for auth transaction status.
 */
async function handleAuthStatus(req, res) {
  try {
    const params = extractParams(req);
    const txid = params.txid;

    if (!txid) {
      return duoError(res, 40001, "Missing required request parameters", "txid");
    }

    const docRef = db.collection("auth_transactions").doc(txid);
    const doc = await docRef.get();

    if (!doc.exists) {
      return duoError(res, 40002, "Invalid request parameters", "Invalid txid");
    }

    const data = doc.data();

    // If still waiting but expired, treat as timeout
    if (data.result === "waiting" && data.expiresAt && data.expiresAt.toDate() < new Date()) {
      // Update Firestore so future checks are fast
      docRef.update({
        result: "deny",
        status: "timeout",
        statusMsg: "Login timed out.",
        resolvedAt: new Date(),
      }).catch(() => {});

      return duoSuccess(res, {
        auth_delayed: false,
        result: "deny",
        status: "timeout",
        status_msg: "Login timed out.",
      });
    }

    duoSuccess(res, {
      auth_delayed: false,
      result: data.result,
      status: data.status,
      status_msg: data.statusMsg,
    });
  } catch (err) {
    logger.error("auth_status error", err);
    duoError(res, 50000, "Internal server error");
  }
}

module.exports = { handleAuthStatus };
