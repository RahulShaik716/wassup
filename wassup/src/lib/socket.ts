import { io } from 'socket.io-client';

function normalizeServerUrl(input?: string) {
  const trimmed = input?.trim();

  if (!trimmed) {
    if (__DEV__) {
      return 'http://192.168.1.70:3001';
    }

    throw new Error(
      'Missing EXPO_PUBLIC_SERVER_URL. Set it before creating an installable Android build.'
    );
  }

  try {
    const url = new URL(trimmed);

    if (url.hostname.endsWith('.onrender.com')) {
      url.port = '';
    }

    return url.toString().replace(/\/$/, '');
  } catch {
    return trimmed;
  }
}

const SERVER_URL = normalizeServerUrl(process.env.EXPO_PUBLIC_SERVER_URL);

console.log('[socket] SERVER_URL =', SERVER_URL);
export const socket = io(SERVER_URL, {
  autoConnect: false,
});
