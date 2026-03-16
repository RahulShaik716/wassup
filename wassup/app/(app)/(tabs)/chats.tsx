import { router } from 'expo-router';
  import { Text, View, Button } from 'react-native';

  import { useSession } from '@/src/features/auth/session-context';
  import { DEMO_USERS } from '@/src/features/chat/demo-users';

  export default function ChatsScreen() {
    const { user } = useSession();

    const otherUsers = DEMO_USERS.filter((candidate) => candidate.id !== user?.id);

    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
        }}>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>Chats</Text>
        <Text>Signed in as: {user?.name}</Text>

        {otherUsers.map((chatUser) => (
          <Button
            key={chatUser.id}
            title={`Chat with ${chatUser.name}`}
            onPress={() => router.push(`/chat/${chatUser.id}`)}
          />
        ))}
      </View>
    );
  }