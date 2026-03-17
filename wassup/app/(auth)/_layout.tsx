import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/src/features/auth/session-context';
import { palette } from '@/src/theme';

export default function AuthLayout() {
  const { isHydrating, user } = useSession();

  if (isHydrating) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.background,
        }}>
        <ActivityIndicator size="large" color={palette.accentDark} />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/chats" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
