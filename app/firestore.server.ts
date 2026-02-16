import { initializeApp, cert, getApps, getApp, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App;

if (getApps().length === 0) {
  // On Cloud Run (same GCP project), use Application Default Credentials
  // Locally, use explicit service account credentials from .env
  if (process.env.FIREBASE_PRIVATE_KEY) {
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  } else {
    // ADC works automatically on Cloud Run, Cloud Functions, etc.
    app = initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }
} else {
  app = getApp();
}

const firestore: Firestore = getFirestore(app);

export { firestore, app };
export default firestore;

