import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { configureGoogleSignIn } from '@/src/features/auth/google-auth';
import { buildUsername, normalizeStoredUser } from '@/src/features/auth/user-profile';
import type { AppUser } from '@/src/types/user';

const SESSION_STORAGE_KEY = 'wassup.session';

type SessionContextValue = {
  isHydrating: boolean;
  isSigningIn: boolean;
  user: AppUser | null;
  signInAsGuest: (name: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

function buildGuestId(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `guest-${slug || 'user'}-${Date.now().toString(36)}`;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    let isMounted = true;
    configureGoogleSignIn();

    async function loadSession() {
      try {
        const storedUser = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);

        if (storedUser && isMounted) {
          setUser(normalizeStoredUser(JSON.parse(storedUser) as AppUser));
        }
      } finally {
        if (isMounted) {
          setIsHydrating(false);
        }
      }
    }

    void loadSession();

    return () => {
      isMounted = false;
    };
  }, []);

  async function persistSession(nextUser: AppUser) {
    setUser(nextUser);
    await SecureStore.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(nextUser));
  }

  async function signInAsGuest(name: string) {
    const trimmedName = name.trim();

    if (!trimmedName) {
      throw new Error('Enter a display name to continue.');
    }

    const guestId = buildGuestId(trimmedName);

    await persistSession({
      id: guestId,
      name: trimmedName,
      provider: 'guest',
      username: buildUsername({
        id: guestId,
        name: trimmedName,
        provider: 'guest',
      }),
    });
  }

  async function signInWithGoogle() {
    setIsSigningIn(true);

    try {
      configureGoogleSignIn();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const response = await GoogleSignin.signIn();

      if (response.type !== 'success') {
        return;
      }

      const googleUser = response.data.user;

      await persistSession({
        id: googleUser.id,
        name: googleUser.name || googleUser.email.split('@')[0] || 'Google User',
        email: googleUser.email,
        avatarUrl: googleUser.photo,
        provider: 'google',
        username: buildUsername({
          email: googleUser.email,
          id: googleUser.id,
          name: googleUser.name,
          provider: 'google',
        }),
      });
    } finally {
      setIsSigningIn(false);
    }
  }

  async function signOut() {
    if (user?.provider === 'google') {
      try {
        await GoogleSignin.signOut();
      } catch {
        // Ignore native sign-out failures and clear local session regardless.
      }
    }

    await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
    setUser(null);
  }

  return (
    <SessionContext.Provider
      value={{
        isHydrating,
        isSigningIn,
        user,
        signInAsGuest,
        signInWithGoogle,
        signOut,
      }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);

  if (!value) {
    throw new Error('useSession must be used inside SessionProvider');
  }

  return value;
}
