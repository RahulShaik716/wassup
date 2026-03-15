 import { router, useLocalSearchParams } from 'expo-router';
  import { Button, Text, View } from 'react-native';

  export default function ChatDetailScreen() {
    const { chatId } = useLocalSearchParams<{ chatId: string }>();

    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>Chat Detail</Text>
        <Text>Chat ID: {chatId}</Text>
        <Button title="Start Demo Call" onPress={() => router.push('/call/demo-call')} />
      </View>
    );
  }