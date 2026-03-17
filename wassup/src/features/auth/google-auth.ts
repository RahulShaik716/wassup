import { GoogleSignin } from '@react-native-google-signin/google-signin';

let isConfigured = false;

function trimEnv(value: string | undefined) {
  return value?.trim() || undefined;
}

export function hasGoogleSignInConfig() {
  return Boolean(trimEnv(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID));
}

export function configureGoogleSignIn() {
  if (isConfigured) {
    return;
  }

  GoogleSignin.configure({
    scopes: ['profile', 'email'],
    webClientId: trimEnv(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
    iosClientId: trimEnv(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
  });

  isConfigured = true;
}

export function getGoogleSetupMessage() {
  return 'Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to enable Google sign-in in the dev build.';
}
