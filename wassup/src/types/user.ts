export type AuthProvider = 'google' | 'guest';

export type AppUser = {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  provider: AuthProvider;
  username: string;
};

export type PublicUser = Pick<AppUser, 'id' | 'username'>;
