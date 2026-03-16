import { router } from 'expo-router';
  import { Alert, Button, Modal, Text, View } from 'react-native';
  import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

  import { useSession } from '@/src/features/auth/session-context';
  import { socket } from '@/src/lib/socket';
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

    useEffect(() => {
      if (!user) {
        setIncomingCall(null);
        setCurrentCall(null);
        socket.disconnect();
        return;
      }

      function joinCurrentUser() {
        socket.emit('user:join', { userId: user.id, name: user.name });
      }

      function handleConnect() {
        joinCurrentUser();
      }

      function handleIncoming(call: CallPayload) {
        setIncomingCall(withStatus(call, 'incoming'));
      }

      function handleAccepted(call: CallPayload) {
        setIncomingCall(null);
        setCurrentCall(withStatus(call, 'active'));
        router.replace(`/call/${call.id}`);
      }

      function handleRejected(call: CallPayload) {
        const otherName = user.id === call.fromUserId ? call.toUserName : call.fromUserName;
        setIncomingCall((value) => (value?.id === call.id ? null : value));
        setCurrentCall((value) => (value?.id === call.id ? null : value));
        Alert.alert('Call rejected', `${otherName} rejected the call`);
        router.replace('/chats');
      }

      function handleEnded(call: CallPayload) {
        const otherName = user.id === call.fromUserId ? call.toUserName : call.fromUserName;
        setIncomingCall((value) => (value?.id === call.id ? null : value));
        setCurrentCall((value) => (value?.id === call.id ? null : value));
        Alert.alert('Call ended', `${otherName} ended the call`);
        router.replace('/chats');
      }

      socket.on('connect', handleConnect);
      socket.on('call:incoming', handleIncoming);
      socket.on('call:accepted', handleAccepted);
      socket.on('call:rejected', handleRejected);
      socket.on('call:ended', handleEnded);

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
      };
    }, [user]);

    function startCall(input: { toUserId: string; toUserName: string; mode: CallMode }) {
      if (!user) return;

      socket.emit(
        'call:invite',
        {
          fromUserId: user.id,
          fromUserName: user.name,
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
          setCurrentCall(nextCall);
          router.push(`/call/${nextCall.id}`);
        }
      );
    }

    function acceptIncomingCall() {
      if (!incomingCall) return;

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
              backgroundColor: 'rgba(0,0,0,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}>
            <View
              style={{
                width: '100%',
                maxWidth: 360,
                backgroundColor: 'white',
                borderRadius: 16,
                padding: 20,
                gap: 12,
              }}>
              <Text style={{ fontSize: 22, fontWeight: '700' }}>Incoming Call</Text>
              <Text>{incomingCall?.fromUserName}</Text>
              <Text>{incomingCall?.mode === 'video' ? 'Video call' : 'Voice call'}</Text>
              <Button title="Accept" onPress={acceptIncomingCall} />
              <Button title="Reject" onPress={rejectIncomingCall} />
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