/*
 * Copyright (c) Elmahdy Abdallah Youssef. All rights reserved.
 * Developed by Elmahdy Abdallah Youssef, Software Developer.
 * Class of 2022, Faculty of Science, Cairo University, Zoology Department.
 */

import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const FIRESTORE_DB_ID = firebaseConfig.firestoreDatabaseId || 'zootopiaclub';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
}, FIRESTORE_DB_ID);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

const FAST_ACCESS_APP_NAME = 'zootopia-fast-access';

/**
 * Keeps phone-OTP fast access on a dedicated auth instance so it does not
 * accidentally inherit full-account login/register behavior.
 */
export function createFastAccessAuth() {
  const fastAccessApp = getApps().some((candidate) => candidate.name === FAST_ACCESS_APP_NAME)
    ? getApp(FAST_ACCESS_APP_NAME)
    : initializeApp(firebaseConfig, FAST_ACCESS_APP_NAME);

  return getAuth(fastAccessApp);
}

// Connection test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log(`Firestore connection successful to database: ${FIRESTORE_DB_ID}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error(`Please check your Firebase configuration. The client is offline for database: ${FIRESTORE_DB_ID}`);
    } else {
      console.warn(`Firestore connection test (${FIRESTORE_DB_ID}):`, error instanceof Error ? error.message : error);
    }
  }
}

if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
  testConnection();
}
