  import { Redirect, Stack } from 'expo-router';

  import { useSession } from '@/src/features/auth/session-context';

  export default function AuthLayout() {
    const { user } = useSession();

    if (user) {
      return <Redirect href="/chats" />;
    }

    return <Stack screenOptions={{ headerShown: false }} />;
  }