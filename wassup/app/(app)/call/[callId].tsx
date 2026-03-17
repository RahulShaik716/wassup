import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Text, View } from 'react-native';
import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
} from 'react-native-webrtc';
import { useLocalSearchParams } from 'expo-router';

import { useSession } from '@/src/features/auth/session-context';
import { useCall } from '@/src/features/call/call-context';
import { socket } from '@/src/lib/socket';
import {
  createPeerConnection,
  getLocalMediaStream,
  setAudioEnabled,
  setVideoEnabled,
  switchCamera,
} from '@/src/lib/webrtc';

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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Text>No active call</Text>
      </View>
    );
  }

  const otherName =
    currentCall.fromUserId === user?.id ? currentCall.toUserName : currentCall.fromUserName;

  if (isVideoCall) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111' }}>
        {remoteStream ? (
          <RTCView streamURL={remoteStream.toURL()} objectFit="cover" style={{ flex: 1 }} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: 'white' }}>Waiting for remote video...</Text>
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
              right: 16,
              top: 48,
              width: 120,
              height: 180,
              borderRadius: 12,
              backgroundColor: '#333',
            }}
          />
        ) : null}

        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 32,
            gap: 12,
          }}>
          <Text style={{ color: 'white', textAlign: 'center' }}>RTC: {rtcStatus}</Text>
          <Button title={isMuted ? 'Unmute' : 'Mute'} onPress={toggleMute} />
          <Button title={isVideoEnabled ? 'Hide Camera' : 'Show Camera'} onPress={toggleVideo} />
          <Button title="Flip Camera" onPress={flipCamera} />
          <Button title="End Call" onPress={endCurrentCall} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
      <Text style={{ fontSize: 26, fontWeight: '700' }}>Voice Call</Text>
      <Text>With: {otherName}</Text>
      <Text>Signal status: {currentCall.status}</Text>
      <Text>RTC status: {rtcStatus}</Text>
      <Button title={isMuted ? 'Unmute' : 'Mute'} onPress={toggleMute} />
      <Button title="End Call" onPress={endCurrentCall} />
    </View>
  );
}
