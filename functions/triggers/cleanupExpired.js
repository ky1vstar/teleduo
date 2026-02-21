const logger = require("firebase-functions/logger");
const { db } = require("../firebaseInit");

// Collections that have an expiresAt field and should be cleaned up
const EXPIRED_COLLECTIONS = ["enrollments", "portal_enrollments", "auth_transactions"];

const isEmulator = !!process.env.FUNCTIONS_EMULATOR;
const CLEANUP_INTERVAL_MS = isEmulator ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000;
const CUTOFF_MS = CLEANUP_INTERVAL_MS;

const META_DOC = db.collection("_meta").doc("cleanup");

/**
 * Delete all documents in the given collections where expiresAt < cutoff.
 * Runs in batches of 200 to stay within Firestore limits.
 */
async function cleanupExpiredDocuments() {
  const cutoff = new Date(Date.now() - CUTOFF_MS);
  let totalDeleted = 0;

  for (const collectionName of EXPIRED_COLLECTIONS) {
    let deleted = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const snap = await db
        .collection(collectionName)
        .where("expiresAt", "<", cutoff)
        .limit(200)
        .get();

      if (snap.empty) break;

      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      deleted += snap.size;
    }

    if (deleted > 0) {
      logger.info(`Cleaned up ${deleted} expired documents from ${collectionName}`);
    }
    totalDeleted += deleted;
  }

  logger.info(`Expired documents cleanup complete. Total deleted: ${totalDeleted}`);
}

/**
 * Lazy cleanup: fire-and-forget, runs at most once per CLEANUP_INTERVAL_MS.
 * Stores last run timestamp in Firestore (_meta/cleanup) to survive cold starts.
 */
function lazyCleanup() {
  db.runTransaction(async (tx) => {
    const snap = await tx.get(META_DOC);
    const lastRun = snap.exists && snap.data().lastRun
      ? snap.data().lastRun.toDate().getTime()
      : 0;
    if (Date.now() - lastRun < CLEANUP_INTERVAL_MS) return false;
    tx.set(META_DOC, { lastRun: new Date() }, { merge: true });
    return true;
  })
    .then((shouldRun) => {
      if (shouldRun) return cleanupExpiredDocuments();
    })
    .catch((err) => logger.error("Lazy cleanup failed", err));
}

module.exports = { cleanupExpiredDocuments, lazyCleanup };
