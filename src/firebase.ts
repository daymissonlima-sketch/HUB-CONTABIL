import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, setLogLevel } from 'firebase/firestore';
import firebaseAppletConfig from '../firebase-applet-config.json';

export const firebaseConfig = {
  apiKey: firebaseAppletConfig.apiKey,
  authDomain: firebaseAppletConfig.authDomain,
  projectId: firebaseAppletConfig.projectId,
  storageBucket: firebaseAppletConfig.storageBucket,
  messagingSenderId: firebaseAppletConfig.messagingSenderId,
  appId: firebaseAppletConfig.appId,
  firestoreDatabaseId: firebaseAppletConfig.firestoreDatabaseId,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
try {
  setLogLevel('silent');
} catch {}

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export function isFirestoreQuotaExceeded(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = sessionStorage.getItem('ml_firestore_quota_exceeded');
  if (stored) {
    const until = parseInt(stored, 10);
    if (!isNaN(until) && Date.now() < until) {
      return true;
    }
    sessionStorage.removeItem('ml_firestore_quota_exceeded');
  }
  return false;
}

export function markFirestoreQuotaExceeded(): void {
  if (typeof window === 'undefined') return;
  // Hold off on Firestore writes for 30 minutes to stop hammering quota limits
  const until = Date.now() + 30 * 60 * 1000;
  sessionStorage.setItem('ml_firestore_quota_exceeded', String(until));
  console.warn('Firestore write quota exceeded: Operating safely in local offline-first mode.');
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  const errMessage = error instanceof Error ? error.message : String(error);
  if (errMessage.includes('resource-exhausted') || errMessage.includes('Quota exceeded')) {
    markFirestoreQuotaExceeded();
    return;
  }
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (typeof window !== 'undefined') {
  testConnection();
}

export async function signInWithGooglePopup() {
  return signInWithPopup(auth, googleProvider);
}

export async function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function registerUserWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function sendPasswordReset(email: string) {
  return sendPasswordResetEmail(auth, email.trim());
}

export async function createSecondaryUserAndSendReset(email: string, tempPassword: string) {
  const secondaryAppName = 'SecondaryAuthAdminApp';
  let secondaryApp = getApps().find(a => a.name === secondaryAppName);
  if (!secondaryApp) {
    secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  }
  const secondaryAuth = getAuth(secondaryApp);

  let createdInAuth = false;
  try {
    await createUserWithEmailAndPassword(secondaryAuth, email.trim(), tempPassword);
    createdInAuth = true;
  } catch (err: any) {
    // Se o usuário já existia no Firebase Auth, continuamos para enviar o e-mail
    if (err?.code !== 'auth/email-already-in-use') {
      throw err;
    }
  } finally {
    try {
      await signOut(secondaryAuth);
    } catch {}
  }

  // Envia o e-mail oficial do Firebase com o link para criação/redefinição da senha
  await sendPasswordResetEmail(auth, email.trim());

  return { createdInAuth };
}

export async function signOutFirebase() {
  return signOut(auth);
}

