import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, UserRole } from '../types';
import { User } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { 
  collection,
  getDocs,
  query,
  orderBy
} from 'firebase/firestore';
import { cloudFunctions, storage } from '../firebase';

const USERS_COLLECTION = 'users';

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const userDoc = await getDoc(doc(db, USERS_COLLECTION, uid));
    if (userDoc.exists()) {
      return userDoc.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
};

export const createUserProfile = async (user: User, additionalData?: Partial<UserProfile>): Promise<UserProfile> => {
  const now = Date.now();
  const normalizedEmail = (user.email || '').trim() || `${user.uid}@local.user`;
  const normalizedDisplayName = (user.displayName || '').trim() || normalizedEmail.split('@')[0] || `user-${user.uid.slice(0, 6)}`;
  const userProfile: UserProfile = {
    uid: user.uid,
    email: normalizedEmail,
    displayName: normalizedDisplayName,
    role: 'user', // Default role
    createdAt: now,
    photoURL: user.photoURL || undefined,
    pinnedLocations: [],
    ...additionalData
  };

  try {
    await setDoc(doc(db, USERS_COLLECTION, user.uid), userProfile, { merge: true });
    return userProfile;
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw error;
  }
};

export const ensureUserProfileDocument = async (user: User): Promise<void> => {
  try {
    const callable = httpsCallable(cloudFunctions, 'ensureUserProfile');
    await callable({
      email: user.email || '',
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
    });
  } catch (error) {
    console.error('Error ensuring user profile by callable:', error);
    throw error;
  }
};

export const uploadUserProfileImage = async (uid: string, file: File): Promise<string> => {
  const normalizedUid = uid.trim();
  if (!normalizedUid) {
    throw new Error('uid is required');
  }

  const timestamp = Date.now();
  const storageRef = ref(storage, `users/${normalizedUid}/profile/avatar_${timestamp}.jpg`);
  const snapshot = await uploadBytes(storageRef, file, {
    contentType: 'image/jpeg',
  });
  return getDownloadURL(snapshot.ref);
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>): Promise<void> => {
  try {
    const userRef = doc(db, USERS_COLLECTION, uid);
    await updateDoc(userRef, data);
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

export const getAllUsers = async (): Promise<UserProfile[]> => {
  try {
    const q = query(collection(db, USERS_COLLECTION), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as UserProfile);
  } catch (error) {
    console.error('Error fetching all users:', error);
    throw error;
  }
};

export const updateUserRole = async (uid: string, role: UserRole): Promise<void> => {
  try {
    const userRef = doc(db, USERS_COLLECTION, uid);
    await updateDoc(userRef, { role });
  } catch (error) {
    console.error('Error updating user role:', error);
    throw error;
  }
};

export const addUserFcmToken = async (uid: string, token: string): Promise<void> => {
  const normalized = token.trim();
  if (!normalized) return;

  try {
    await setDoc(
      doc(db, USERS_COLLECTION, uid),
      {
        fcmTokens: arrayUnion(normalized),
        lastPushTokenUpdatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error('Error adding FCM token:', error);
    throw error;
  }
};

export const removeUserFcmToken = async (uid: string, token: string): Promise<void> => {
  const normalized = token.trim();
  if (!normalized) return;

  try {
    await setDoc(
      doc(db, USERS_COLLECTION, uid),
      {
        fcmTokens: arrayRemove(normalized),
        lastPushTokenUpdatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error('Error removing FCM token:', error);
    throw error;
  }
};
