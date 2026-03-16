import { RTCPeerConnection, mediaDevices, type MediaStream } from 'react-native-webrtc';

  import type { CallMode } from '@/src/types/call';

  export const RTC_CONFIGURATION = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  };

  export function createPeerConnection() {
    return new RTCPeerConnection(RTC_CONFIGURATION);
  }

  export async function getLocalMediaStream(mode: CallMode): Promise<MediaStream> {
    if (mode === 'video') {
      return mediaDevices.getUserMedia({
        audio: true,
          video: {
                width: { ideal: 1280, max: 2160, min: 360 },
                height: { ideal: 720, max: 2160, min: 360 },
                frameRate: { ideal: 30, max: 60 , min : 15 },
                facingMode: 'user',
            }
      });
    }

    return mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
  }

  export function setAudioEnabled(stream: MediaStream, enabled: boolean) {
    const track = stream.getAudioTracks()[0];
    if (track) track.enabled = enabled;
  }

  export function setVideoEnabled(stream: MediaStream, enabled: boolean) {
    const track = stream.getVideoTracks()[0];
    if (track) track.enabled = enabled;
  }

  export function switchCamera(stream: MediaStream) {
    const track = stream.getVideoTracks()[0] as any;
    track?._switchCamera?.();
  }