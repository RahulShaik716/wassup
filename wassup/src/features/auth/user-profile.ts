import type { AppUser, PublicUser } from '@/src/types/user';

function cleanUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
}

export function buildUsername(input: {
  email?: string | null;
  id?: string | null;
  name?: string | null;
  provider?: AppUser['provider'];
}) {
  const emailBase = input.email?.split('@')[0];
  const nameBase = input.name?.trim().split(/\s+/).join('_');
  const base = cleanUsername(emailBase || nameBase || 'user');
  const suffix = input.id?.slice(-4).toLowerCase() || '0000';

  if (input.provider === 'guest') {
    return cleanUsername(`guest_${base}_${suffix}`) || `guest_${suffix}`;
  }

  return base || `user_${suffix}`;
}

export function normalizeStoredUser(user: AppUser): AppUser {
  return {
    ...user,
    username: user.username || buildUsername(user),
  };
}

export function normalizePublicUser(user: PublicUser): PublicUser {
  return {
    ...user,
    username: user.username || buildUsername(user),
  };
}
