import { Button, Text, View } from 'react-native';

  import { useSession } from '@/src/features/auth/session-context';

  export default function SettingsScreen() {
    const { user, signOut } = useSession();

    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
        }}>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>Settings</Text>
        <Text>Signed in as: {user?.name}</Text>
        <Button title="Sign Out" onPress={signOut} />
      </View>
    );
  }