import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON!
) as ServiceAccount;

const firebaseAdminApp =
  getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });

export const firebaseAdminAuth = getAuth(firebaseAdminApp);
