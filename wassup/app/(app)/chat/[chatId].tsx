import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { Avatar } from '@/src/components/common/Avatar';
import { useSession } from '@/src/features/auth/session-context';
import { useCall } from '@/src/features/call/call-context';
import { buildChatId } from '@/src/features/chat/chat-utils';
import { socket } from '@/src/lib/socket';
import { palette, spacing } from '@/src/theme';
import type { ChatMessage } from '@/src/types/chat';

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ChatDetailScreen() {
  const params = useLocalSearchParams<{
    chatId: string;
    email?: string;
    name?: string;
  }>();
  const { startCall } = useCall();
  const { user } = useSession();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState(socket.connected ? 'Connected' : 'Connecting');

  const otherUser = {
    id: params.chatId,
    name: params.name || params.chatId,
    email: params.email,
  };

  const roomId = useMemo(() => {
    if (!user || !params.chatId) {
      return '';
    }

    return buildChatId(user.id, params.chatId);
  }, [params.chatId, user]);

  useEffect(() => {
    if (!user || !roomId) {
      return;
    }

    const currentUser = user;

    function joinRoom() {
      socket.emit('user:join', {
        userId: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        avatarUrl: currentUser.avatarUrl,
      });

      socket.emit(
        'chat:join',
        { chatId: roomId },
        (response: { ok: boolean; messages?: ChatMessage[] }) => {
          if (response?.ok && response.messages) {
            setMessages(response.messages);
          }
        }
      );
    }

    function handleConnect() {
      setStatus('Connected');
      joinRoom();
    }

    function handleDisconnect() {
      setStatus('Disconnected');
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
      setStatus('Connecting');
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
      (response: { ok: boolean }) => {
        if (response?.ok) {
          setDraft('');
        }
      }
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.md,
              marginTop: spacing.sm,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.surface,
            }}>
            <Pressable
              onPress={() => router.back()}
              style={{
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
                backgroundColor: palette.surfaceMuted,
              }}>
              <Ionicons color={palette.text} name="chevron-back" size={20} />
            </Pressable>
            <Avatar name={otherUser.name} size={54} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.text, fontSize: 20, fontWeight: '800' }}>
                {otherUser.name}
              </Text>
              <Text style={{ color: palette.mutedText, marginTop: 2 }}>
                {otherUser.email || status}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable
                onPress={() =>
                  startCall({
                    toUserId: otherUser.id,
                    toUserName: otherUser.name,
                    mode: 'voice',
                  })
                }
                style={{
                  width: 42,
                  height: 42,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 16,
                  backgroundColor: palette.accentMuted,
                }}>
                <Ionicons color={palette.accentDark} name="call-outline" size={20} />
              </Pressable>
              <Pressable
                onPress={() =>
                  startCall({
                    toUserId: otherUser.id,
                    toUserName: otherUser.name,
                    mode: 'video',
                  })
                }
                style={{
                  width: 42,
                  height: 42,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 16,
                  backgroundColor: palette.accentMuted,
                }}>
                <Ionicons color={palette.accentDark} name="videocam-outline" size={20} />
              </Pressable>
            </View>
          </View>

          <FlatList
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: messages.length === 0 ? 'center' : 'flex-end',
              paddingVertical: spacing.lg,
              gap: spacing.sm,
            }}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isMine = item.senderId === user?.id;

              return (
                <View
                  style={{
                    alignSelf: isMine ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: 18,
                    backgroundColor: isMine ? palette.accentMuted : palette.surface,
                    borderWidth: 1,
                    borderColor: isMine ? '#BEE6D6' : palette.border,
                  }}>
                  <Text style={{ color: palette.text, fontSize: 15, lineHeight: 22 }}>{item.text}</Text>
                  <Text
                    style={{
                      color: palette.mutedText,
                      fontSize: 11,
                      marginTop: spacing.xs,
                      textAlign: 'right',
                    }}>
                    {formatMessageTime(item.createdAt)}
                  </Text>
                </View>
              );
            }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View
                style={{
                  padding: spacing.lg,
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: palette.border,
                  backgroundColor: palette.surface,
                }}>
                <Text style={{ color: palette.text, fontSize: 18, fontWeight: '700' }}>
                  Start the conversation
                </Text>
                <Text style={{ color: palette.mutedText, lineHeight: 22, marginTop: spacing.sm }}>
                  Messages will stay in memory on the server for now. Persisting them comes next.
                </Text>
              </View>
            }
          />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: spacing.sm,
              padding: spacing.sm,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.surface,
            }}>
            <TextInput
              multiline
              onChangeText={setDraft}
              placeholder="Type a message"
              placeholderTextColor={palette.mutedText}
              style={{
                flex: 1,
                minHeight: 44,
                maxHeight: 120,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.sm,
                color: palette.text,
              }}
              value={draft}
            />
            <Pressable
              onPress={sendMessage}
              style={{
                width: 48,
                height: 48,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: palette.accentDark,
              }}>
              <Ionicons color={palette.surface} name="arrow-up" size={20} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
