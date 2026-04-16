import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  User,
  signInWithEmailAndPassword, 
  signInWithPopup,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth } from '../firebase';
import { UserProfile } from '../types';
import {
  createUserProfile,
  ensureUserProfileDocument,
  getUserProfile,
  updateUserProfile,
} from '../services/userService';
import {
  ensureForegroundPushListener,
  isPushDisabledForUser,
  stopForegroundPushListener,
  syncPushTokenForUser,
  unregisterPushTokenForUser,
} from '../services/pushService';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  loadingStage: 'booting' | 'session' | 'profile' | 'ready';
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signupWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<'booting' | 'session' | 'profile' | 'ready'>('booting');

  const resolveGooglePhotoURL = async (currentUser: User): Promise<string> => {
    const fromGoogleProvider = (currentUser.providerData || [])
      .find((provider) => provider.providerId === 'google.com')
      ?.photoURL
      ?.trim();
    const fallbackPhoto = currentUser.photoURL?.trim();
    if (fromGoogleProvider || fallbackPhoto) {
      return fromGoogleProvider || fallbackPhoto || '';
    }

    try {
      await currentUser.reload();
      const refreshedProviderPhoto = (currentUser.providerData || [])
        .find((provider) => provider.providerId === 'google.com')
        ?.photoURL
        ?.trim();
      const refreshedFallbackPhoto = currentUser.photoURL?.trim();
      return refreshedProviderPhoto || refreshedFallbackPhoto || '';
    } catch (error) {
      console.error('Failed to reload auth user for Google photo:', error);
      return '';
    }
  };

  const shouldSyncGooglePhoto = (profilePhotoURL: string, googlePhotoURL: string): boolean => {
    if (!googlePhotoURL) return false;
    if (!profilePhotoURL) return true;

    const normalizedProfile = profilePhotoURL.trim().toLowerCase();
    const normalizedGoogle = googlePhotoURL.trim().toLowerCase();
    if (normalizedProfile === normalizedGoogle) return false;

    const isGoogleHostedPhoto =
      normalizedProfile.includes('googleusercontent.com') ||
      normalizedProfile.includes('googleapis.com/a/');

    // Keep custom uploaded avatar untouched, but refresh old Google-hosted URL.
    return isGoogleHostedPhoto;
  };

  const fetchProfile = async (currentUser: User) => {
    try {
      await ensureUserProfileDocument(currentUser);
      await currentUser.getIdToken(true);

      let profile = await getUserProfile(currentUser.uid);
      if (!profile) {
        try {
          profile = await createUserProfile(currentUser);
        } catch (createError) {
          console.error('createUserProfile failed, fallback to ensureUserProfile:', createError);
          await ensureUserProfileDocument(currentUser);
          profile = await getUserProfile(currentUser.uid);
        }
      }

      if (!profile) {
        await ensureUserProfileDocument(currentUser);
        profile = await getUserProfile(currentUser.uid);
      }

      const googlePhotoURL = await resolveGooglePhotoURL(currentUser);
      const currentPhotoURL = profile?.photoURL?.trim() || '';
      if (profile && shouldSyncGooglePhoto(currentPhotoURL, googlePhotoURL)) {
        try {
          await updateUserProfile(currentUser.uid, {
            photoURL: googlePhotoURL,
            profileUpdatedAt: Date.now(),
          });
          profile = {
            ...profile,
            photoURL: googlePhotoURL,
            profileUpdatedAt: Date.now(),
          };
        } catch (photoSyncError) {
          console.error('Failed to sync Google photo URL to profile:', photoSyncError);
        }
      }

      setUserProfile(profile || null);
      if (currentUser.uid) {
        if (isPushDisabledForUser(currentUser.uid)) {
          stopForegroundPushListener();
        } else {
          void ensureForegroundPushListener();
          void syncPushTokenForUser(currentUser.uid);
        }
      }
    } catch (error) {
      console.error('Error in fetchProfile:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoadingStage('session');
      setUser(user);
      if (user) {
        setLoadingStage('profile');
        await fetchProfile(user);
      } else {
        setUserProfile(null);
        stopForegroundPushListener();
      }
      setLoadingStage('ready');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signupWithEmail = async (email: string, password: string) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    // Profile creation is handled by onAuthStateChanged, but we can ensure it here if needed
    // or just let the effect handle it.
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    if (user?.uid) {
      try {
        await unregisterPushTokenForUser(user.uid);
      } catch (error) {
        console.warn('Push cleanup during logout failed:', error);
      }
    }

    stopForegroundPushListener();
    await signOut(auth);
    setUserProfile(null);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      userProfile, 
      loading, 
      loadingStage,
      loginWithEmail, 
      signupWithEmail, 
      loginWithGoogle, 
      logout,
      refreshProfile 
    }}>
      {children}
    </AuthContext.Provider>
  );
};
