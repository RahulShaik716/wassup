import { useEffect, useMemo, useState } from 'react';
  import {
    Button,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Text,
    TextInput,
    View,
  } from 'react-native';
  import { useLocalSearchParams } from 'expo-router';

  import { useSession } from '@/src/features/auth/session-context';
  import { DEMO_USERS } from '@/src/features/chat/demo-users';
  import { buildChatId } from '@/src/features/chat/chat-utils';
  import { socket } from '@/src/lib/socket';
  import type { ChatMessage } from '@/src/types/chat';
import { useCall } from '@/src/features/call/call-context';
  export default function ChatDetailScreen() {
    const { chatId: otherUserId } = useLocalSearchParams<{ chatId: string }>();
    const { user } = useSession();

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [draft, setDraft] = useState('');
    const [status, setStatus] = useState(socket.connected ? 'connected' : 'disconnected');

    const otherUser = DEMO_USERS.find((candidate) => candidate.id === otherUserId);
     const { startCall } = useCall();
    const roomId = useMemo(() => {
      if (!user || !otherUserId) {
        return '';
      }

      return buildChatId(user.id, otherUserId);
    }, [otherUserId, user]);

    useEffect(() => {
      if (!user || !roomId) {
        return;
      }

      function joinRoom() {
        socket.emit('user:join', { userId: user.id, name: user.name });

        socket.emit('chat:join', { chatId: roomId }, (response: { ok: boolean; messages?: ChatMessage[] }) => {
          if (response?.ok && response.messages) {
            setMessages(response.messages);
          }
        });
      }

      function handleConnect() {
        setStatus('connected');
        joinRoom();
      }

      function handleDisconnect() {
        setStatus('disconnected');
      }

      function handleChatMessage(message: ChatMessage) {
        if (message.chatId === roomId) {
          setMessages((currentMessages) => [...currentMessages, message]);
        }
      }

      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
      socket.on('chat:message', handleChatMessage);

      if (socket.connected) {
        handleConnect();
      } else {
        socket.connect();
      }

      return () => {
        socket.emit('chat:leave', { chatId: roomId });
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.off('chat:message', handleChatMessage);
      };
    }, [roomId, user]);

    function sendMessage() {
      const text = draft.trim();

      if (!text || !user || !roomId) {
        return;
      }

      socket.emit(
        'chat:send',
        {
          chatId: roomId,
          text,
          senderId: user.id,
          senderName: user.name,
        },
        (response: { ok: boolean; error?: string }) => {
          if (response?.ok) {
            setDraft('');
          } else {
            console.log('send failed', response?.error);
          }
        }
      );
    }

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: undefined })}>
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '700' }}>
            Chat with {otherUser?.name ?? otherUserId}
          </Text>
          <Text>Status: {status}</Text>

           <View style={{ flexDirection: 'row', gap: 12 }}>
    <Button
      title="Voice Call"
      onPress={() =>
        otherUser &&
        startCall({
          toUserId: otherUser.id,
          toUserName: otherUser.name,
          mode: 'voice',
        })
      }
    />
    <Button
      title="Video Call"
      onPress={() =>
        otherUser &&
        startCall({
          toUserId: otherUser.id,
          toUserName: otherUser.name,
          mode: 'video',
        })
      }
    />
  </View>
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingVertical: 12 }}
            renderItem={({ item }) => {
              const isMine = item.senderId === user?.id;

              return (
                <View
                  style={{
                    alignSelf: isMine ? 'flex-end' : 'flex-start',
                    backgroundColor: isMine ? '#dcf8c6' : '#f1f1f1',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginBottom: 8,
                    maxWidth: '80%',
                  }}>
                  <Text style={{ fontWeight: '600', marginBottom: 4 }}>{item.senderName}</Text>
                  <Text>{item.text}</Text>
                </View>
              );
            }}
            ListEmptyComponent={<Text>No messages yet</Text>}
          />

          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message"
            style={{
              borderWidth: 1,
              borderColor: '#ccc',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />

          <Button title="Send" onPress={sendMessage} />
        </View>
      </KeyboardAvoidingView>
    );
  }