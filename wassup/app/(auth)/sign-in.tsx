import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getGoogleSetupMessage,
  hasGoogleSignInConfig,
} from '@/src/features/auth/google-auth';
import { useSession } from '@/src/features/auth/session-context';
import { palette, spacing } from '@/src/theme';

export default function SignInScreen() {
  const { isSigningIn, signInAsGuest, signInWithGoogle } = useSession();
  const [guestName, setGuestName] = useState('');

  async function handleGoogleSignIn() {
    if (!hasGoogleSignInConfig()) {
      Alert.alert('Google setup needed', getGoogleSetupMessage());
      return;
    }

    try {
      await signInWithGoogle();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to complete Google sign-in.';
      Alert.alert('Google sign-in failed', message);
    }
  }

  async function handleGuestSignIn() {
    try {
      await signInAsGuest(guestName);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Enter a name to continue.';
      Alert.alert('Guest sign-in', message);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ flex: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl }}>
        <View
          style={{
            backgroundColor: palette.surface,
            borderRadius: 32,
            borderWidth: 1,
            borderColor: palette.border,
            padding: spacing.xl,
            shadowColor: palette.shadow,
            shadowOpacity: 1,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 12 },
            elevation: 4,
          }}>
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: spacing.lg,
              backgroundColor: palette.accentMuted,
            }}>
            <Text style={{ color: palette.accentDark, fontSize: 34, fontWeight: '800' }}>W</Text>
          </View>

          <Text
            style={{
              color: palette.text,
              fontSize: 34,
              fontWeight: '800',
              marginBottom: spacing.sm,
            }}>
            Wassup
          </Text>
          <Text
            style={{
              color: palette.mutedText,
              fontSize: 16,
              lineHeight: 24,
              marginBottom: spacing.xl,
            }}>
            Chat, voice call, and video call with the people who are online right now.
          </Text>

          <Pressable
            onPress={() => {
              void handleGoogleSignIn();
            }}
            style={{
              minHeight: 58,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: spacing.md,
              backgroundColor: palette.accentDark,
            }}>
            {isSigningIn ? (
              <ActivityIndicator color={palette.surface} />
            ) : (
              <Text style={{ color: palette.surface, fontSize: 16, fontWeight: '700' }}>
                Continue with Google
              </Text>
            )}
          </Pressable>

          <Text
            style={{
              color: palette.mutedText,
              fontSize: 13,
              lineHeight: 19,
              marginBottom: spacing.lg,
            }}>
            {hasGoogleSignInConfig()
              ? 'Use Google for the full experience.'
              : getGoogleSetupMessage()}
          </Text>

          <View
            style={{
              padding: spacing.lg,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.surfaceMuted,
            }}>
            <Text
              style={{
                color: palette.text,
                fontSize: 16,
                fontWeight: '700',
                marginBottom: spacing.sm,
              }}>
              Continue without Google
            </Text>
            <Text style={{ color: palette.mutedText, marginBottom: spacing.md }}>
              Pick a display name and get started right away.
            </Text>
            <TextInput
              autoCapitalize="words"
              onChangeText={setGuestName}
              placeholder="Enter your display name"
              placeholderTextColor={palette.mutedText}
              style={{
                borderWidth: 1,
                borderColor: palette.border,
                borderRadius: 16,
                paddingHorizontal: spacing.md,
                paddingVertical: 14,
                color: palette.text,
                backgroundColor: palette.surface,
                marginBottom: spacing.md,
              }}
              value={guestName}
            />
            <Pressable
              onPress={() => {
                void handleGuestSignIn();
              }}
              style={{
                minHeight: 52,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: palette.surface,
                borderWidth: 1,
                borderColor: palette.border,
              }}>
              <Text style={{ color: palette.text, fontSize: 15, fontWeight: '700' }}>
                Continue as Guest
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
