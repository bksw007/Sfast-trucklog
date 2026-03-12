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
const USER_PROFILE_CACHE_PREFIX = 'user-profile-cache:';
const ALL_USERS_CACHE_KEY = 'all-users-cache';
const USER_PROFILE_CACHE_TTL_MS = 2 * 60 * 1000;
const ALL_USERS_CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEnvelope<T> = {
  expiresAt: number;
  data: T;
};

const inMemoryUserProfileCache = new Map<string, CacheEnvelope<UserProfile | null>>();
let inMemoryAllUsersCache: CacheEnvelope<UserProfile[]> | null = null;

const getSessionStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const readCache = <T>(key: string): T | undefined => {
  const storage = getSessionStorage();
  if (!storage) return undefined;

  try {
    const raw = storage.getItem(key);
    if (!raw) return undefined;

    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Date.now()) {
      storage.removeItem(key);
      return undefined;
    }

    return parsed.data;
  } catch {
    storage.removeItem(key);
    return undefined;
  }
};

const writeCache = <T>(key: string, data: T, ttlMs: number) => {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    const payload: CacheEnvelope<T> = {
      expiresAt: Date.now() + ttlMs,
      data,
    };
    storage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore storage failures and continue with network data.
  }
};

const invalidateUserProfileCache = (uid: string) => {
  inMemoryUserProfileCache.delete(uid);
  const storage = getSessionStorage();
  storage?.removeItem(`${USER_PROFILE_CACHE_PREFIX}${uid}`);
};

const invalidateAllUsersCache = () => {
  inMemoryAllUsersCache = null;
  const storage = getSessionStorage();
  storage?.removeItem(ALL_USERS_CACHE_KEY);
};

const cacheUserProfile = (uid: string, profile: UserProfile | null) => {
  const payload: CacheEnvelope<UserProfile | null> = {
    expiresAt: Date.now() + USER_PROFILE_CACHE_TTL_MS,
    data: profile,
  };

  inMemoryUserProfileCache.set(uid, payload);
  writeCache(`${USER_PROFILE_CACHE_PREFIX}${uid}`, profile, USER_PROFILE_CACHE_TTL_MS);
};

const cacheAllUsers = (users: UserProfile[]) => {
  inMemoryAllUsersCache = {
    expiresAt: Date.now() + ALL_USERS_CACHE_TTL_MS,
    data: users,
  };
  writeCache(ALL_USERS_CACHE_KEY, users, ALL_USERS_CACHE_TTL_MS);
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const inMemory = inMemoryUserProfileCache.get(uid);
    if (inMemory && inMemory.expiresAt >= Date.now()) {
      return inMemory.data;
    }

    const cached = readCache<UserProfile | null>(`${USER_PROFILE_CACHE_PREFIX}${uid}`);
    if (cached !== undefined) {
      cacheUserProfile(uid, cached);
      return cached;
    }

    const userDoc = await getDoc(doc(db, USERS_COLLECTION, uid));
    if (userDoc.exists()) {
      const profile = userDoc.data() as UserProfile;
      cacheUserProfile(uid, profile);
      return profile;
    }
    cacheUserProfile(uid, null);
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
    invalidateUserProfileCache(uid);
    invalidateAllUsersCache();
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

export const getAllUsers = async (): Promise<UserProfile[]> => {
  try {
    if (inMemoryAllUsersCache && inMemoryAllUsersCache.expiresAt >= Date.now()) {
      return inMemoryAllUsersCache.data;
    }

    const cached = readCache<UserProfile[]>(ALL_USERS_CACHE_KEY);
    if (cached !== undefined) {
      cacheAllUsers(cached);
      return cached;
    }

    const q = query(collection(db, USERS_COLLECTION), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const users = querySnapshot.docs.map(doc => doc.data() as UserProfile);
    cacheAllUsers(users);
    users.forEach((user) => cacheUserProfile(user.uid, user));
    return users;
  } catch (error) {
    console.error('Error fetching all users:', error);
    throw error;
  }
};

export const updateUserRole = async (uid: string, role: UserRole): Promise<void> => {
  try {
    const callable = httpsCallable(cloudFunctions, 'setUserRole');
    await callable({ uid, role });
    invalidateUserProfileCache(uid);
    invalidateAllUsersCache();
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
