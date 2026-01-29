import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, UserRole } from '../types';
import { User } from 'firebase/auth';
import { 
  collection,
  getDocs,
  query,
  orderBy
} from 'firebase/firestore';

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
  if (!user.email) throw new Error('User email is required');

  const now = Date.now();
  const userProfile: UserProfile = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || user.email.split('@')[0],
    role: 'user', // Default role
    createdAt: now,
    photoURL: user.photoURL || undefined,
    ...additionalData
  };

  try {
    await setDoc(doc(db, USERS_COLLECTION, user.uid), userProfile);
    return userProfile;
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw error;
  }
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
