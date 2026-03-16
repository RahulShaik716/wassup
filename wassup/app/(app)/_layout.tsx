import { Redirect, Stack } from 'expo-router';

  import { useSession } from '@/src/features/auth/session-context';

  export default function AppLayout() {
    const { user } = useSession();

    if (!user) {
      return <Redirect href="/sign-in" />;
    }

    return (
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[chatId]" options={{ title: 'Chat' }} />
        <Stack.Screen
          name="call/[callId]"
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
      </Stack>
    );
  }