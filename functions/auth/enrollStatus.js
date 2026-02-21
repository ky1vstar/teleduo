const logger = require("firebase-functions/logger");
const { db } = require("../firebaseInit");
const { extractParams, duoError, duoSuccess } = require("../helpers");

/**
 * POST /auth/v2/enroll_status
 * Check enrollment status for a user.
 */
async function handleEnrollStatus(req, res) {
  try {
    const params = extractParams(req);
    const userId = params.user_id;
    const activationCodeParam = params.activation_code;

    if (!userId) {
      return duoError(res, 40001, "Missing required request parameters", "user_id");
    }
    if (!activationCodeParam) {
      return duoError(res, 40001, "Missing required request parameters", "activation_code");
    }

    // activation_code in the request is the full deep link URL
    // Extract the code from ?start=<code>
    let code = activationCodeParam;
    try {
      const url = new URL(activationCodeParam);
      const startParam = url.searchParams.get("start");
      if (startParam) {
        code = startParam;
      }
    } catch {
      // Not a URL, use as-is
    }

    // Find enrollment document
    const enrollDoc = await db.collection("enrollments").doc(code).get();

    if (!enrollDoc.exists) {
      return duoSuccess(res, "invalid");
    }

    const data = enrollDoc.data();

    // Verify this enrollment belongs to the specified user
    if (data.userId !== userId) {
      return duoSuccess(res, "invalid");
    }

    // Check expiration
    const now = new Date();
    if (data.expiresAt && data.expiresAt.toDate() < now) {
      return duoSuccess(res, "invalid");
    }

    // Return status
    duoSuccess(res, data.status); // "waiting" | "success" | "invalid"
  } catch (err) {
    logger.error("enroll_status error", err);
    duoError(res, 50000, "Internal server error");
  }
}

module.exports = { handleEnrollStatus };
