import { createContext, useContext, useState, type PropsWithChildren } from 'react';

  import { DEMO_USERS } from '@/src/features/chat/demo-users';
  import type { DemoUser } from '@/src/types/chat';

  type SessionContextValue = {
    user: DemoUser | null;
    signIn: (userId: string) => void;
    signOut: () => void;
  };

  const SessionContext = createContext<SessionContextValue | undefined>(undefined);

  export function SessionProvider({ children }: PropsWithChildren) {
    const [user, setUser] = useState<DemoUser | null>(null);

    function signIn(userId: string) {
      const nextUser = DEMO_USERS.find((candidate) => candidate.id === userId);

      if (!nextUser) {
        throw new Error(`Unknown demo user: ${userId}`);
      }

      setUser(nextUser);
    }

    function signOut() {
      setUser(null);
    }

    return (
      <SessionContext.Provider value={{ user, signIn, signOut }}>
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