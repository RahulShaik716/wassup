 import { router } from 'expo-router';
  import { Button, Text, View } from 'react-native';

  export default function ChatsScreen() {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>Chats</Text>
        <Text>Placeholder chat list screen</Text>
        <Button title="Open Demo Chat" onPress={() => router.push('/chat/demo-chat')} />
      </View>
    );
  }
