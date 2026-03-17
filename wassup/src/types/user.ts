export type AuthProvider = 'google' | 'guest';

export type AppUser = {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  provider: AuthProvider;
};

export type PublicUser = Omit<AppUser, 'provider'>;
