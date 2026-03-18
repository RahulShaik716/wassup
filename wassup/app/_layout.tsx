import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '@/src/features/auth/session-context';
import { CallProvider } from '@/src/features/call/call-context';
import { PushNotificationsProvider } from '@/src/features/notifications/push-notifications-provider';
import { palette } from '@/src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <PushNotificationsProvider>
          <CallProvider>
            <StatusBar backgroundColor={palette.background} style="dark" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" />
            </Stack>
          </CallProvider>
        </PushNotificationsProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
