const logger = require("firebase-functions/logger");
const { db } = require("../firebaseInit");

/**
 * Cascade delete all user data from Firestore when a Firebase Auth user is deleted.
 * Deletes: devices subcollection, related enrollments, auth_transactions, and user doc.
 *
 * @param {object} user - The Firebase Auth user record being deleted
 */
async function onUserDeleted(user) {
  const uid = user.uid;
  logger.info("Cascading delete for user", { uid });

  try {
    const batch = db.batch();

    // 1. Delete all devices in subcollection
    const devicesSnap = await db
      .collection("users")
      .doc(uid)
      .collection("devices")
      .get();
    devicesSnap.forEach((doc) => batch.delete(doc.ref));

    // 2. Delete related enrollments (by userId)
    const enrollmentsSnap = await db
      .collection("enrollments")
      .where("userId", "==", uid)
      .get();
    enrollmentsSnap.forEach((doc) => batch.delete(doc.ref));

    // 3. Delete related auth_transactions (by userId)
    const txSnap = await db
      .collection("auth_transactions")
      .where("userId", "==", uid)
      .get();
    txSnap.forEach((doc) => batch.delete(doc.ref));

    // 4. Delete the user document itself
    batch.delete(db.collection("users").doc(uid));

    await batch.commit();
    logger.info("Cascade delete completed", { uid });
  } catch (err) {
    logger.error("Error in cascade delete", { uid, error: err });
  }
}

module.exports = { onUserDeleted };
