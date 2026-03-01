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
import { createUserProfile, ensureUserProfileDocument, getUserProfile } from '../services/userService';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
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

  const fetchProfile = async (currentUser: User) => {
    try {
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
      setUserProfile(profile || null);
    } catch (error) {
      console.error('Error in fetchProfile:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        await fetchProfile(user);
      } else {
        setUserProfile(null);
      }
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
