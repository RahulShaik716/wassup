import { useEffect, useState } from 'react';
import { FlatList, Pressable, SafeAreaView, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Avatar } from '@/src/components/common/Avatar';
import { useCall } from '@/src/features/call/call-context';
import { useSession } from '@/src/features/auth/session-context';
import { socket } from '@/src/lib/socket';
import { palette, spacing } from '@/src/theme';
import type { PublicUser } from '@/src/types/user';

type UsersListResponse = {
  ok: boolean;
  users?: PublicUser[];
};

type PresenceUpdatePayload = {
  user: PublicUser;
  isOnline: boolean;
};

function sortUsers(users: PublicUser[]) {
  return [...users].sort((left, right) => left.name.localeCompare(right.name));
}

export default function ChatsScreen() {
  const { currentCall } = useCall();
  const { user } = useSession();
  const [connectionLabel, setConnectionLabel] = useState(socket.connected ? 'Live' : 'Connecting');
  const [onlineUsers, setOnlineUsers] = useState<PublicUser[]>([]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const currentUser = user;

    function syncUsers() {
      socket.emit(
        'users:list',
        (response: UsersListResponse) => {
          if (!response?.ok || !response.users) {
            return;
          }

          setOnlineUsers(
            sortUsers(response.users.filter((candidate) => candidate.id !== currentUser.id))
          );
        }
      );
    }

    function handleConnect() {
      setConnectionLabel('Live');
      socket.emit('user:join', {
        userId: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        avatarUrl: currentUser.avatarUrl,
      });
      syncUsers();
    }

    function handleDisconnect() {
      setConnectionLabel('Disconnected');
    }

    function handlePresenceUpdate(_payload: PresenceUpdatePayload) {
      syncUsers();
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('presence:update', handlePresenceUpdate);

    if (socket.connected) {
      handleConnect();
    } else {
      setConnectionLabel('Connecting');
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('presence:update', handlePresenceUpdate);
    };
  }, [user]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        data={onlineUsers}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View
            style={{
              padding: spacing.lg,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.surface,
            }}>
            <Text
              style={{
                color: palette.text,
                fontSize: 18,
                fontWeight: '700',
                marginBottom: spacing.sm,
              }}>
              No one else is online
            </Text>
            <Text style={{ color: palette.mutedText, lineHeight: 22 }}>
              Open Wassup on another device and sign in. Connected users will appear here
              automatically.
            </Text>
          </View>
        }
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md, gap: spacing.md }}>
            <View
              style={{
                padding: spacing.lg,
                borderRadius: 28,
                borderWidth: 1,
                borderColor: palette.border,
                backgroundColor: palette.surface,
              }}>
              <Text style={{ color: palette.mutedText, fontSize: 12, fontWeight: '700' }}>
                LIVE DIRECTORY
              </Text>
              <Text
                style={{
                  color: palette.text,
                  fontSize: 30,
                  fontWeight: '800',
                  marginTop: spacing.xs,
                }}>
                Chats
              </Text>
              <Text style={{ color: palette.mutedText, marginTop: spacing.sm, lineHeight: 22 }}>
                Signed in as {user?.name}. Tap any live contact to start chatting or call directly.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View
                style={{
                  flex: 1,
                  padding: spacing.md,
                  borderRadius: 18,
                  backgroundColor: palette.surface,
                  borderWidth: 1,
                  borderColor: palette.border,
                }}>
                <Text style={{ color: palette.mutedText, fontSize: 12, fontWeight: '700' }}>
                  STATUS
                </Text>
                <Text style={{ color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 4 }}>
                  {connectionLabel}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  padding: spacing.md,
                  borderRadius: 18,
                  backgroundColor: palette.surface,
                  borderWidth: 1,
                  borderColor: palette.border,
                }}>
                <Text style={{ color: palette.mutedText, fontSize: 12, fontWeight: '700' }}>
                  ACTIVE CALL
                </Text>
                <Text style={{ color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 4 }}>
                  {currentCall ? currentCall.mode : 'None'}
                </Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              router.push({
                pathname: '/chat/[chatId]',
                params: {
                  chatId: item.id,
                  name: item.name,
                  email: item.email ?? '',
                },
              });
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.surface,
            }}>
            <Avatar name={item.name} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.text, fontSize: 17, fontWeight: '700' }}>
                {item.name}
              </Text>
              <Text style={{ color: palette.mutedText, marginTop: 4 }}>
                {item.email || 'Online now'}
              </Text>
            </View>
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: palette.accentMuted,
              }}>
              <Text style={{ color: palette.accentDark, fontSize: 12, fontWeight: '700' }}>
                Open
              </Text>
            </View>
          </Pressable>
        )}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
