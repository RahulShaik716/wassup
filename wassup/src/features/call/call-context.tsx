import { router } from 'expo-router';
import { Alert, Modal, Pressable, Text, View } from 'react-native';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { Avatar } from '@/src/components/common/Avatar';
import { useSession } from '@/src/features/auth/session-context';
import {
  playIncomingCallRingtone,
  playMessageTone,
  startOutgoingRingback,
  stopAllNotificationSounds,
  stopIncomingCallRingtone,
  stopOutgoingRingback,
} from '@/src/lib/notification-sounds';
import { socket } from '@/src/lib/socket';
import { palette, spacing } from '@/src/theme';
import type { ChatMessage } from '@/src/types/chat';
import type { CallMode, CallPayload, CallState } from '@/src/types/call';

type CallContextValue = {
  currentCall: CallState | null;
  startCall: (input: { toUserId: string; toUserName: string; mode: CallMode }) => void;
  acceptIncomingCall: () => void;
  rejectIncomingCall: () => void;
  endCurrentCall: () => void;
};

const CallContext = createContext<CallContextValue | undefined>(undefined);

function withStatus(call: CallPayload, status: CallState['status']): CallState {
  return { ...call, status };
}

export function CallProvider({ children }: PropsWithChildren) {
  const { user } = useSession();
  const [incomingCall, setIncomingCall] = useState<CallState | null>(null);
  const [currentCall, setCurrentCall] = useState<CallState | null>(null);
  const incomingCallRef = useRef<CallState | null>(null);
  const currentCallRef = useRef<CallState | null>(null);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    currentCallRef.current = currentCall;
  }, [currentCall]);

  useEffect(() => {
    if (!user) {
      setIncomingCall(null);
      setCurrentCall(null);
      stopAllNotificationSounds();
      socket.disconnect();
      return;
    }

    const currentUser = user;

    function joinCurrentUser() {
      socket.emit('user:join', {
        userId: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        avatarUrl: currentUser.avatarUrl,
        username: currentUser.username,
      });
    }

    function handleConnect() {
      joinCurrentUser();
    }

    function handleIncoming(call: CallPayload) {
      if (
        incomingCallRef.current?.id === call.id ||
        currentCallRef.current?.id === call.id
      ) {
        return;
      }

      void playIncomingCallRingtone();
      setIncomingCall(withStatus(call, 'incoming'));
    }

    function handleAccepted(call: CallPayload) {
      stopIncomingCallRingtone();
      stopOutgoingRingback();
      setIncomingCall(null);
      setCurrentCall(withStatus(call, 'active'));
      router.replace(`/call/${call.id}`);
    }

    function handleRejected(call: CallPayload) {
      const otherName =
        currentUser.id === call.fromUserId ? call.toUserName : call.fromUserName;
      stopIncomingCallRingtone();
      stopOutgoingRingback();
      setIncomingCall((value) => (value?.id === call.id ? null : value));
      setCurrentCall((value) => (value?.id === call.id ? null : value));
      Alert.alert('Call rejected', `${otherName} rejected the call`);
      router.replace('/chats');
    }

    function handleEnded(call: CallPayload) {
      const otherName =
        currentUser.id === call.fromUserId ? call.toUserName : call.fromUserName;
      stopIncomingCallRingtone();
      stopOutgoingRingback();
      setIncomingCall((value) => (value?.id === call.id ? null : value));
      setCurrentCall((value) => (value?.id === call.id ? null : value));
      Alert.alert('Call ended', `${otherName} ended the call`);
      router.replace('/chats');
    }

    function handleMissed(call: CallPayload) {
      const otherName =
        currentUser.id === call.fromUserId ? call.toUserName : call.fromUserName;
      const message =
        currentUser.id === call.fromUserId
          ? `${otherName} did not answer`
          : `Missed ${call.mode} call from ${otherName}`;

      stopIncomingCallRingtone();
      stopOutgoingRingback();
      setIncomingCall((value) => (value?.id === call.id ? null : value));
      setCurrentCall((value) => (value?.id === call.id ? null : value));
      Alert.alert('Call missed', message);
      router.replace('/chats');
    }

    function handleChatMessage(message: ChatMessage) {
      if (message.senderId === currentUser.id) {
        return;
      }

      if (currentCallRef.current) {
        return;
      }

      void playMessageTone();
    }

    socket.on('connect', handleConnect);
    socket.on('call:incoming', handleIncoming);
    socket.on('call:accepted', handleAccepted);
    socket.on('call:rejected', handleRejected);
    socket.on('call:ended', handleEnded);
    socket.on('call:missed', handleMissed);
    socket.on('chat:message', handleChatMessage);

    if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('call:incoming', handleIncoming);
      socket.off('call:accepted', handleAccepted);
      socket.off('call:rejected', handleRejected);
      socket.off('call:ended', handleEnded);
      socket.off('call:missed', handleMissed);
      socket.off('chat:message', handleChatMessage);
      stopAllNotificationSounds();
    };
  }, [user]);

    function startCall(input: { toUserId: string; toUserName: string; mode: CallMode }) {
      if (!user) return;

      socket.emit(
        'call:invite',
        {
          fromUserId: user.id,
          fromUserName: user.username,
          toUserId: input.toUserId,
          toUserName: input.toUserName,
          mode: input.mode,
        },
        (response: { ok: boolean; error?: string; call?: CallPayload }) => {
          if (!response?.ok || !response.call) {
            Alert.alert('Call failed', response?.error ?? 'Unable to start call');
            return;
          }

          const nextCall = withStatus(response.call, 'ringing');
          startOutgoingRingback();
          setCurrentCall(nextCall);
          router.push(`/call/${nextCall.id}`);
        }
      );
    }

    function acceptIncomingCall() {
      if (!incomingCall) return;

      stopIncomingCallRingtone();
      socket.emit(
        'call:accept',
        { callId: incomingCall.id },
        (response: { ok: boolean; error?: string }) => {
          if (!response?.ok) {
            Alert.alert('Accept failed', response?.error ?? 'Unable to accept call');
          }
        }
      );

      setIncomingCall(null);
    }

    function rejectIncomingCall() {
      if (!incomingCall) return;

      stopIncomingCallRingtone();
      socket.emit(
        'call:reject',
        { callId: incomingCall.id },
        (response: { ok: boolean; error?: string }) => {
          if (!response?.ok) {
            Alert.alert('Reject failed', response?.error ?? 'Unable to reject call');
          }
        }
      );

      setIncomingCall(null);
    }

    function endCurrentCall() {
      if (!currentCall) return;

      stopAllNotificationSounds();
      socket.emit('call:end', { callId: currentCall.id });
    }

  return (
    <CallContext.Provider
      value={{
        currentCall,
        startCall,
        acceptIncomingCall,
        rejectIncomingCall,
        endCurrentCall,
      }}>
      {children}

      <Modal animationType="fade" transparent visible={Boolean(incomingCall)}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.lg,
            backgroundColor: 'rgba(16,18,20,0.55)',
          }}>
          <View
            style={{
              width: '100%',
              maxWidth: 360,
              borderRadius: 28,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.surface,
              padding: spacing.lg,
            }}>
            <Text style={{ color: palette.mutedText, fontSize: 12, fontWeight: '700' }}>
              INCOMING CALL
            </Text>
            <View style={{ alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.lg }}>
              <Avatar name={incomingCall?.fromUserName || 'caller'} size={88} />
              <Text
                style={{
                  color: palette.text,
                  fontSize: 26,
                  fontWeight: '800',
                  marginTop: spacing.md,
                }}>
                @{incomingCall?.fromUserName}
              </Text>
              <Text style={{ color: palette.mutedText, marginTop: spacing.xs }}>
                {incomingCall?.mode === 'video' ? 'Video call' : 'Voice call'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable
                onPress={rejectIncomingCall}
                style={{
                  flex: 1,
                  minHeight: 54,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: palette.surfaceMuted,
                }}>
                <Text style={{ color: palette.text, fontSize: 15, fontWeight: '700' }}>Decline</Text>
              </Pressable>
              <Pressable
                onPress={acceptIncomingCall}
                style={{
                  flex: 1,
                  minHeight: 54,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: palette.accentDark,
                }}>
                <Text style={{ color: palette.surface, fontSize: 15, fontWeight: '700' }}>Accept</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </CallContext.Provider>
  );
}

export function useCall() {
  const value = useContext(CallContext);

  if (!value) {
    throw new Error('useCall must be used inside CallProvider');
  }

  return value;
}
