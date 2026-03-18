import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { useSession } from '@/src/features/auth/session-context';
import { useCall } from '@/src/features/call/call-context';
import { socket } from '@/src/lib/socket';
import { palette, spacing } from '@/src/theme';

const SOCKET_ACK_TIMEOUT_MS = 5_000;

type CallHistoryItem = {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  mode: 'voice' | 'video';
  status: 'ringing' | 'active' | 'rejected' | 'ended' | 'missed';
  createdAt: string;
  answeredAt?: string;
  endedAt?: string;
};

type CallsListResponse = {
  ok: boolean;
  calls?: CallHistoryItem[];
  error?: string;
};

type UserJoinResponse = {
  ok: boolean;
  error?: string;
};

function formatCallTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildStatusLabel(item: CallHistoryItem, currentUserId: string) {
  const isOutgoing = item.fromUserId === currentUserId;

  if (item.status === 'missed') {
    return isOutgoing ? 'No answer' : 'Missed';
  }

  if (item.status === 'rejected') {
    return isOutgoing ? 'Declined' : 'You declined';
  }

  if (item.status === 'active' || item.status === 'ended') {
    return isOutgoing ? 'Outgoing' : 'Incoming';
  }

  return 'Ringing';
}

function buildCallTarget(item: CallHistoryItem, currentUserId: string) {
  return item.fromUserId === currentUserId ? item.toUserName : item.fromUserName;
}

function buildStatusColor(item: CallHistoryItem, currentUserId: string) {
  if (item.status === 'missed' && item.toUserId === currentUserId) {
    return '#C1554B';
  }

  if (item.status === 'rejected') {
    return palette.mutedText;
  }

  return palette.accentDark;
}

export default function CallsScreen() {
  const { currentCall } = useCall();
  const { user } = useSession();
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([]);
  const [connectionLabel, setConnectionLabel] = useState(socket.connected ? 'Online' : 'Connecting');
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const liveCallSummary = useMemo(() => {
    if (!currentCall || !user) {
      return null;
    }

    const otherName =
      currentCall.fromUserId === user.id ? currentCall.toUserName : currentCall.fromUserName;

    return `${currentCall.mode === 'video' ? 'Video' : 'Voice'} call with @${otherName}`;
  }, [currentCall, user]);

  const syncCalls = useCallback(() => {
    if (!user) {
      return;
    }

    setIsLoadingHistory(true);
    setHistoryError(null);

    const performList = () => {
      socket.timeout(SOCKET_ACK_TIMEOUT_MS).emit(
        'calls:list',
        (error: Error | null, response: CallsListResponse) => {
          setIsLoadingHistory(false);

          if (error) {
            setHistoryError('The server did not respond in time. Reload the app and try again.');
            return;
          }

          if (!response?.ok) {
            setHistoryError(response?.error ?? 'Unable to load call history right now.');
            return;
          }

          setCallHistory(response.calls ?? []);
        }
      );
    };

    socket.timeout(SOCKET_ACK_TIMEOUT_MS).emit(
      'calls:list',
      (listError: Error | null, response: CallsListResponse) => {
        setIsLoadingHistory(false);

        if (!listError && response?.ok) {
          setCallHistory(response.calls ?? []);
          return;
        }

        if (!response?.ok && response?.error !== 'Not authenticated') {
          setHistoryError(response?.error ?? 'Unable to load call history right now.');
          return;
        }

        setIsLoadingHistory(true);

        socket.timeout(SOCKET_ACK_TIMEOUT_MS).emit(
          'user:join',
          {
            userId: user.id,
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl,
            username: user.username,
          },
          (joinError: Error | null, joinResponse: UserJoinResponse) => {
            if (joinError) {
              setIsLoadingHistory(false);
              setHistoryError('Could not reconnect to the server. Please try again.');
              return;
            }

            if (!joinResponse?.ok) {
              setIsLoadingHistory(false);
              setHistoryError(joinResponse?.error ?? 'Unable to sync your account right now.');
              return;
            }

            performList();
          }
        );
      }
    );
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    function handleConnect() {
      setConnectionLabel('Online');
      syncCalls();
    }

    function handleDisconnect() {
      setConnectionLabel('Offline');
    }

    function handleCallMutation() {
      syncCalls();
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('call:accepted', handleCallMutation);
    socket.on('call:rejected', handleCallMutation);
    socket.on('call:ended', handleCallMutation);
    socket.on('call:missed', handleCallMutation);

    if (socket.connected) {
      handleConnect();
    } else {
      setConnectionLabel('Connecting...');
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('call:accepted', handleCallMutation);
      socket.off('call:rejected', handleCallMutation);
      socket.off('call:ended', handleCallMutation);
      socket.off('call:missed', handleCallMutation);
    };
  }, [syncCalls, user]);

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        return;
      }

      if (socket.connected) {
        syncCalls();
        return;
      }

      setConnectionLabel('Connecting...');
      socket.connect();
    }, [syncCalls, user])
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: palette.background }}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        data={callHistory}
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
            <Text style={{ color: palette.text, fontSize: 18, fontWeight: '700' }}>
              No calls yet
            </Text>
            <Text style={{ color: palette.mutedText, marginTop: spacing.sm, lineHeight: 22 }}>
              {isLoadingHistory
                ? 'Loading your recent calls...'
                : historyError ??
                  'Your recent voice and video calls will show up here once you start talking to people.'}
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
                CALL HISTORY
              </Text>
              <Text
                style={{
                  color: palette.text,
                  fontSize: 30,
                  fontWeight: '800',
                  marginTop: spacing.xs,
                }}>
                Calls
              </Text>
              <Text style={{ color: palette.mutedText, marginTop: spacing.sm, lineHeight: 22 }}>
                See your recent incoming, outgoing, missed, and declined calls.
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
                  backgroundColor: currentCall ? palette.accentMuted : palette.surface,
                  borderWidth: 1,
                  borderColor: currentCall ? '#BEE6D6' : palette.border,
                }}>
                <Text style={{ color: palette.mutedText, fontSize: 12, fontWeight: '700' }}>
                  ACTIVE CALL
                </Text>
                <Text style={{ color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 4 }}>
                  {currentCall ? 'In progress' : 'Ready'}
                </Text>
                {liveCallSummary ? (
                  <Text style={{ color: palette.mutedText, marginTop: spacing.xs }}>
                    {liveCallSummary}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          if (!user) {
            return null;
          }

          const otherUserId = item.fromUserId === user.id ? item.toUserId : item.fromUserId;
          const otherUsername = buildCallTarget(item, user.id);
          const statusLabel = buildStatusLabel(item, user.id);
          const statusColor = buildStatusColor(item, user.id);

          return (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/chat/[chatId]',
                  params: {
                    chatId: otherUserId,
                    name: otherUsername,
                    username: otherUsername,
                  },
                })
              }
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
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: palette.accentMuted,
                }}>
                <Ionicons
                  color={palette.accentDark}
                  name={item.mode === 'video' ? 'videocam-outline' : 'call-outline'}
                  size={22}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.text, fontSize: 17, fontWeight: '700' }}>
                  @{otherUsername}
                </Text>
                <Text style={{ color: statusColor, marginTop: 4, fontWeight: '600' }}>
                  {statusLabel} · {item.mode === 'video' ? 'Video' : 'Voice'}
                </Text>
                <Text style={{ color: palette.mutedText, marginTop: 4 }}>
                  {formatCallTime(item.createdAt)}
                </Text>
              </View>
            </Pressable>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
