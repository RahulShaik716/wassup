import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
} from 'react-native-webrtc';
import { useLocalSearchParams } from 'expo-router';

import { Avatar } from '@/src/components/common/Avatar';
import { useSession } from '@/src/features/auth/session-context';
import { useCall } from '@/src/features/call/call-context';
import {
  chooseAudioRoute,
  type AudioRoute,
  type AudioRouteState,
  startCallAudio,
  stopCallAudio,
  subscribeToAudioRouteChanges,
} from '@/src/lib/call-audio';
import { socket } from '@/src/lib/socket';
import {
  createPeerConnection,
  getLocalMediaStream,
  setAudioEnabled,
  setVideoEnabled,
  switchCamera,
} from '@/src/lib/webrtc';
import { palette, spacing } from '@/src/theme';

type SessionDescriptionPayload = {
  callId: string;
  sdp: {
    type: string;
    sdp?: string | null;
  };
};

type IceCandidatePayload = {
  callId: string;
  candidate: {
    candidate?: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
  };
};

type PeerConnectionWithLegacyApi = RTCPeerConnection & {
  addStream?: (stream: MediaStream) => void;
  onaddstream?: (event: { stream: MediaStream }) => void;
  onconnectionstatechange?: () => void;
  onicecandidate?: (event: { candidate: RTCIceCandidate | null }) => void;
  oniceconnectionstatechange?: () => void;
  ontrack?: (event: { streams?: MediaStream[]; track: any }) => void;
};

function toSessionDescriptionInit(payload: SessionDescriptionPayload['sdp']) {
  return {
    type: payload.type,
    sdp: payload.sdp ?? '',
  };
}

function getAudioRouteLabel(route: AudioRoute) {
  switch (route) {
    case 'BLUETOOTH':
      return 'Bluetooth';
    case 'EARPIECE':
      return 'Phone';
    case 'SPEAKER_PHONE':
      return 'Speaker';
    case 'WIRED_HEADSET':
      return 'Headphones';
  }
}

function getAudioRouteIcon(route: AudioRoute) {
  switch (route) {
    case 'BLUETOOTH':
      return 'bluetooth';
    case 'EARPIECE':
      return 'phone-portrait-outline';
    case 'SPEAKER_PHONE':
      return 'volume-high-outline';
    case 'WIRED_HEADSET':
      return 'headset-outline';
  }
}

function getAudioRouteOptions(state: AudioRouteState, isVideoCall: boolean) {
  const defaults: AudioRoute[] = isVideoCall
    ? ['SPEAKER_PHONE', 'EARPIECE']
    : ['EARPIECE', 'SPEAKER_PHONE'];

  return Array.from(new Set([...defaults, ...state.available]));
}

function getConnectionLabel(status: string) {
  switch (status) {
    case 'connected':
    case 'completed':
    case 'answer-received':
      return 'Connected';
    case 'disconnected':
      return 'Reconnecting...';
    case 'failed':
      return 'Connection lost';
    case 'closed':
      return 'Call ended';
    default:
      return 'Connecting...';
  }
}

export default function CallScreen() {
  const { callId } = useLocalSearchParams<{ callId: string }>();
  const { user } = useSession();
  const { currentCall, endCurrentCall } = useCall();

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<IceCandidatePayload['candidate'][]>([]);
  const hasOfferedRef = useRef(false);
  const hasAnnouncedReadyRef = useRef(false);

  const [rtcStatus, setRtcStatus] = useState('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(currentCall?.mode === 'video');
  const [audioRouteState, setAudioRouteState] = useState<AudioRouteState>({
    available: [],
    selected: '',
  });
  const [isSwitchingAudioRoute, setIsSwitchingAudioRoute] = useState(false);

  const isCaller = currentCall?.fromUserId === user?.id;
  const isVideoCall = currentCall?.mode === 'video';
  const currentCallId = currentCall?.id;
  const currentCallMode = currentCall?.mode ?? 'voice';

  const sessionConstraints: any = useMemo(
    () => ({
      mandatory: {
        OfferToReceiveAudio: true,
        OfferToReceiveVideo: currentCallMode === 'video',
        VoiceActivityDetection: true,
      },
    }),
    [currentCallMode]
  );

  const flushPendingCandidates = useCallback(async (peer: RTCPeerConnection) => {
    for (const candidate of pendingCandidatesRef.current) {
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    }

    pendingCandidatesRef.current = [];
  }, []);

  const ensurePeerConnection = useCallback(async () => {
    if (peerRef.current) {
      return peerRef.current;
    }

    const peer = createPeerConnection() as PeerConnectionWithLegacyApi;

    peer.onicecandidate = (event: { candidate: RTCIceCandidate | null }) => {
      if (!event.candidate || !currentCallId) {
        return;
      }

      socket.emit('webrtc:ice-candidate', {
        callId: currentCallId,
        candidate: event.candidate,
      });
    };

    peer.oniceconnectionstatechange = () => {
      setRtcStatus(peer.iceConnectionState ?? 'unknown');
    };

    peer.onconnectionstatechange = () => {
      setRtcStatus(peer.connectionState ?? peer.iceConnectionState ?? 'unknown');
    };

    peer.ontrack = (event: { streams?: MediaStream[]; track: any }) => {
      const stream = event.streams?.[0];

      if (stream) {
        setRemoteStream(stream);
        return;
      }

      setRemoteStream((currentStream) => {
        const nextStream = currentStream ?? new MediaStream();
        nextStream.addTrack(event.track);
        return nextStream;
      });
    };

    peer.onaddstream = (event: { stream: MediaStream }) => {
      if (event.stream) {
        setRemoteStream(event.stream);
      }
    };

    const nextLocalStream = await getLocalMediaStream(currentCallMode);
    localStreamRef.current = nextLocalStream;
    setLocalStream(nextLocalStream);

    if (typeof peer.addStream === 'function') {
      peer.addStream(nextLocalStream);
    } else {
      nextLocalStream.getTracks().forEach((track) => {
        peer.addTrack(track, nextLocalStream);
      });
    }

    if (currentCallMode === 'video') {
      const videoSender = peer.getSenders().find((sender) => sender.track?.kind === 'video');

      if (videoSender?.getParameters && videoSender?.setParameters) {
        const params = videoSender.getParameters();
        params.encodings ??= [{ active: true }];
        params.encodings[0].maxBitrate = 1_500_000;
        params.encodings[0].maxFramerate = 30;
        await videoSender.setParameters(params);
      }
    }

    peerRef.current = peer;
    return peer;
  }, [currentCallId, currentCallMode]);

  const cleanupPeer = useCallback(async () => {
    try {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      peerRef.current?.close();
    } catch (error) {
      console.log('cleanup error', error);
    }

    localStreamRef.current = null;
    peerRef.current = null;
    pendingCandidatesRef.current = [];
    hasOfferedRef.current = false;
    hasAnnouncedReadyRef.current = false;
    setIsMuted(false);
    setRtcStatus('idle');
    setLocalStream(null);
    setRemoteStream(null);
    setIsVideoEnabled(currentCall?.mode === 'video');
  }, [currentCall?.mode]);

  function toggleMute() {
    if (!localStreamRef.current) {
      return;
    }

    const nextMuted = !isMuted;
    setAudioEnabled(localStreamRef.current, !nextMuted);
    setIsMuted(nextMuted);
  }

  function toggleVideo() {
    if (!localStreamRef.current || !isVideoCall) {
      return;
    }

    const nextEnabled = !isVideoEnabled;
    setVideoEnabled(localStreamRef.current, nextEnabled);
    setIsVideoEnabled(nextEnabled);
  }

  function flipCamera() {
    if (!localStreamRef.current || !isVideoCall) {
      return;
    }

    switchCamera(localStreamRef.current);
  }

  async function handleSelectAudioRoute(route: AudioRoute) {
    try {
      setIsSwitchingAudioRoute(true);
      const nextState = await chooseAudioRoute(route);
      setAudioRouteState(nextState);
    } finally {
      setIsSwitchingAudioRoute(false);
    }
  }

  useEffect(() => {
    if (!currentCall || currentCall.id !== callId || currentCall.status !== 'active') {
      return;
    }

    const activeCall = currentCall;
    let isMounted = true;
    startCallAudio(activeCall.mode);

    const unsubscribe = subscribeToAudioRouteChanges((nextState) => {
      if (isMounted) {
        setAudioRouteState(nextState);
      }
    });

    async function primeAudioRoute() {
      if (activeCall.mode === 'video') {
        const nextState = await chooseAudioRoute('SPEAKER_PHONE');

        if (isMounted) {
          setAudioRouteState(nextState);
        }
      }
    }

    void primeAudioRoute();

    return () => {
      isMounted = false;
      unsubscribe();
      stopCallAudio();
    };
  }, [callId, currentCall]);

  useEffect(() => {
    if (!currentCall || currentCall.id !== callId || currentCall.status !== 'active' || !user) {
      return;
    }

    const activeCall = currentCall;
    let isCancelled = false;

    async function startRtcIfNeeded() {
      await ensurePeerConnection();

      if (isCancelled) {
        return;
      }

      if (!hasAnnouncedReadyRef.current) {
        hasAnnouncedReadyRef.current = true;
        setRtcStatus('ready');
        socket.emit('call:ready', { callId: activeCall.id });
      }
    }

    async function handleCallReady(payload: { callId: string }) {
      if (payload.callId !== activeCall.id) {
        return;
      }

      const peer = await ensurePeerConnection();

      if (!isCaller || hasOfferedRef.current) {
        return;
      }

      hasOfferedRef.current = true;
      setRtcStatus('creating-offer');

      const offer = await peer.createOffer(sessionConstraints);
      await peer.setLocalDescription(offer);

      socket.emit('webrtc:offer', {
        callId: activeCall.id,
        sdp: offer,
      });

      setRtcStatus('offer-sent');
    }

    async function handleOffer(payload: SessionDescriptionPayload) {
      if (payload.callId !== activeCall.id) {
        return;
      }

      const peer = await ensurePeerConnection();

      await peer.setRemoteDescription(new RTCSessionDescription(toSessionDescriptionInit(payload.sdp)));
      await flushPendingCandidates(peer);

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit('webrtc:answer', {
        callId: activeCall.id,
        sdp: answer,
      });

      setRtcStatus('answer-sent');
    }

    async function handleAnswer(payload: SessionDescriptionPayload) {
      if (payload.callId !== activeCall.id || !peerRef.current) {
        return;
      }

      await peerRef.current.setRemoteDescription(
        new RTCSessionDescription(toSessionDescriptionInit(payload.sdp))
      );
      await flushPendingCandidates(peerRef.current);
      setRtcStatus('answer-received');
    }

    async function handleIceCandidate(payload: IceCandidatePayload) {
      if (payload.callId !== activeCall.id || !payload.candidate) {
        return;
      }

      const peer = await ensurePeerConnection();

      if (!peer.remoteDescription) {
        pendingCandidatesRef.current.push(payload.candidate);
        return;
      }

      await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
    }

    socket.on('call:ready', handleCallReady);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice-candidate', handleIceCandidate);

    startRtcIfNeeded();

    return () => {
      isCancelled = true;
      socket.off('call:ready', handleCallReady);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);
      cleanupPeer();
    };
  }, [callId, cleanupPeer, currentCall, ensurePeerConnection, flushPendingCandidates, isCaller, sessionConstraints, user]);

  if (!currentCall || currentCall.id !== callId) {
    return (
      <SafeAreaView
        edges={['top', 'bottom']}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>No active call</Text>
      </SafeAreaView>
    );
  }

  const otherName =
    currentCall.fromUserId === user?.id ? currentCall.toUserName : currentCall.fromUserName;
  const audioRouteOptions = getAudioRouteOptions(audioRouteState, Boolean(isVideoCall));
  const connectionLabel = getConnectionLabel(rtcStatus);

  if (isVideoCall) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#0E1116' }}>
        {remoteStream ? (
          <RTCView streamURL={remoteStream.toURL()} objectFit="cover" style={{ flex: 1 }} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Avatar name={otherName} size={96} />
            <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginTop: spacing.md }}>
              @{otherName}
            </Text>
            <Text style={{ color: '#C5CCD7', marginTop: spacing.sm }}>Waiting for remote video...</Text>
          </View>
        )}

        {localStream ? (
          <RTCView
            streamURL={localStream.toURL()}
            mirror
            objectFit="cover"
            zOrder={2}
            style={{
              position: 'absolute',
              right: spacing.md,
              top: spacing.xl + spacing.lg,
              width: 118,
              height: 176,
              borderRadius: 18,
              backgroundColor: '#2B3340',
              borderWidth: 2,
              borderColor: 'rgba(255,255,255,0.15)',
            }}
          />
        ) : null}

        <View
          style={{
            position: 'absolute',
            left: spacing.md,
            right: spacing.md,
            top: spacing.md,
            padding: spacing.md,
            borderRadius: 22,
            backgroundColor: 'rgba(14,17,22,0.65)',
          }}>
          <Text style={{ color: '#9EA9B9', fontSize: 12, fontWeight: '700' }}>VIDEO CALL</Text>
          <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginTop: 4 }}>
            @{otherName}
          </Text>
          <Text style={{ color: '#C5CCD7', marginTop: 4 }}>
            {connectionLabel} {audioRouteState.selected ? `| ${audioRouteState.selected}` : ''}
          </Text>
        </View>

        <View
          style={{
            position: 'absolute',
            left: spacing.md,
            right: spacing.md,
            bottom: spacing.xl,
            padding: spacing.md,
            borderRadius: 26,
            backgroundColor: 'rgba(14,17,22,0.72)',
            gap: spacing.md,
          }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {audioRouteOptions.map((route) => {
              const isSelected = audioRouteState.selected === route;

              return (
                <Pressable
                  key={route}
                  onPress={() => {
                    void handleSelectAudioRoute(route);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 999,
                    backgroundColor: isSelected ? '#D9F4EA' : 'rgba(255,255,255,0.08)',
                  }}>
                  <Ionicons
                    color={isSelected ? palette.accentDark : 'white'}
                    name={getAudioRouteIcon(route)}
                    size={16}
                  />
                  <Text
                    style={{
                      color: isSelected ? palette.accentDark : 'white',
                      fontSize: 12,
                      fontWeight: '700',
                    }}>
                    {getAudioRouteLabel(route)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
            <Pressable
              onPress={toggleMute}
              style={{
                flex: 1,
                minHeight: 54,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.08)',
              }}>
              <Ionicons color="white" name={isMuted ? 'mic-off-outline' : 'mic-outline'} size={22} />
              <Text style={{ color: 'white', fontSize: 12, fontWeight: '700', marginTop: 6 }}>
                {isMuted ? 'Unmute' : 'Mute'}
              </Text>
            </Pressable>
            <Pressable
              onPress={toggleVideo}
              style={{
                flex: 1,
                minHeight: 54,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.08)',
              }}>
              <Ionicons
                color="white"
                name={isVideoEnabled ? 'videocam-outline' : 'videocam-off-outline'}
                size={22}
              />
              <Text style={{ color: 'white', fontSize: 12, fontWeight: '700', marginTop: 6 }}>
                {isVideoEnabled ? 'Camera' : 'Camera Off'}
              </Text>
            </Pressable>
            <Pressable
              onPress={flipCamera}
              style={{
                flex: 1,
                minHeight: 54,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.08)',
              }}>
              <Ionicons color="white" name="camera-reverse-outline" size={22} />
              <Text style={{ color: 'white', fontSize: 12, fontWeight: '700', marginTop: 6 }}>
                Flip
              </Text>
            </Pressable>
            <Pressable
              onPress={endCurrentCall}
              style={{
                flex: 1,
                minHeight: 54,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#D74A4A',
              }}>
              <Ionicons color="white" name="call-outline" size={22} />
              <Text style={{ color: 'white', fontSize: 12, fontWeight: '700', marginTop: 6 }}>
                End
              </Text>
            </Pressable>
          </View>

          <Text style={{ color: '#C5CCD7', textAlign: 'center', fontSize: 12 }}>
            {isSwitchingAudioRoute
              ? 'Switching audio route...'
              : 'Tap speaker, Bluetooth, or headphones when available.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ flex: 1, padding: spacing.lg, justifyContent: 'space-between' }}>
        <View style={{ alignItems: 'center', marginTop: spacing.xl }}>
          <Text style={{ color: palette.mutedText, fontSize: 12, fontWeight: '700' }}>VOICE CALL</Text>
          <Text
            style={{
              color: palette.text,
              fontSize: 34,
              fontWeight: '800',
              marginTop: spacing.sm,
            }}>
            @{otherName}
          </Text>
          <Text style={{ color: palette.mutedText, marginTop: spacing.sm }}>
            {connectionLabel} {audioRouteState.selected ? `| ${audioRouteState.selected}` : ''}
          </Text>
        </View>

        <View style={{ alignItems: 'center' }}>
          <View
            style={{
              width: 220,
              height: 220,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: palette.surface,
              borderWidth: 1,
              borderColor: palette.border,
            }}>
            <Avatar name={otherName} size={118} />
          </View>
        </View>

        <View
          style={{
            padding: spacing.lg,
            borderRadius: 28,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.border,
            gap: spacing.md,
          }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {audioRouteOptions.map((route) => {
              const isSelected = audioRouteState.selected === route;

              return (
                <Pressable
                  key={route}
                  onPress={() => {
                    void handleSelectAudioRoute(route);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 999,
                    backgroundColor: isSelected ? palette.accentMuted : palette.surfaceMuted,
                  }}>
                  <Ionicons
                    color={isSelected ? palette.accentDark : palette.text}
                    name={getAudioRouteIcon(route)}
                    size={16}
                  />
                  <Text
                    style={{
                      color: isSelected ? palette.accentDark : palette.text,
                      fontSize: 12,
                      fontWeight: '700',
                    }}>
                    {getAudioRouteLabel(route)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
            <Pressable
              onPress={toggleMute}
              style={{
                flex: 1,
                minHeight: 60,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: palette.surfaceMuted,
              }}>
              <Ionicons
                color={palette.text}
                name={isMuted ? 'mic-off-outline' : 'mic-outline'}
                size={24}
              />
              <Text style={{ color: palette.text, fontSize: 12, fontWeight: '700', marginTop: 6 }}>
                {isMuted ? 'Unmute' : 'Mute'}
              </Text>
            </Pressable>
            <Pressable
              onPress={endCurrentCall}
              style={{
                flex: 1,
                minHeight: 60,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: palette.danger,
              }}>
              <Ionicons color="white" name="call-outline" size={24} />
              <Text style={{ color: 'white', fontSize: 12, fontWeight: '700', marginTop: 6 }}>
                End Call
              </Text>
            </Pressable>
          </View>

          <Text style={{ color: palette.mutedText, textAlign: 'center', fontSize: 12 }}>
            {isSwitchingAudioRoute
              ? 'Switching audio route...'
              : 'Use Speaker for louder playback.'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
