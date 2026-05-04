import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface UserPreferences {
  creatorName: string;
  preferredTitle: string;
  isMuted: boolean;
  lastUpdated: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function savePreferences(userId: string, prefs: Partial<UserPreferences>) {
  const path = `preferences/${userId}`;
  try {
    const docRef = doc(db, path);
    const existing = await getDoc(docRef);
    
    if (existing.exists()) {
      await updateDoc(docRef, {
        ...prefs,
        lastUpdated: new Date().toISOString()
      });
    } else {
      await setDoc(docRef, {
        creatorName: 'Atharv',
        preferredTitle: 'Sir',
        isMuted: false,
        ...prefs,
        lastUpdated: new Date().toISOString()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToPreferences(userId: string, callback: (prefs: UserPreferences) => void) {
  const path = `preferences/${userId}`;
  return onSnapshot(doc(db, path), (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data() as UserPreferences);
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  });
}

export async function getPreferences(userId: string): Promise<UserPreferences | null> {
  const path = `preferences/${userId}`;
  try {
    const snapshot = await getDoc(doc(db, path));
    if (snapshot.exists()) {
      return snapshot.data() as UserPreferences;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}
