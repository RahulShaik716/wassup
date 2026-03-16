 import { Button, Text, View } from 'react-native';

  import { DEMO_USERS } from '@/src/features/chat/demo-users';
  import { useSession } from '@/src/features/auth/session-context';

  export default function SignInScreen() {
    const { signIn } = useSession();

    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
        }}>
        <Text style={{ fontSize: 28, fontWeight: '700' }}>Wassup</Text>
        <Text style={{ color: '#666' }}>Pick a demo user</Text>

        {DEMO_USERS.map((demoUser) => (
          <Button
            key={demoUser.id}
            title={`Continue as ${demoUser.name}`}
            onPress={() => signIn(demoUser.id)}
          />
        ))}
      </View>
    );
  }