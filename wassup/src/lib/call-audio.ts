import { DeviceEventEmitter, type EmitterSubscription } from 'react-native';
import InCallManager from 'react-native-incall-manager';

import type { CallMode } from '@/src/types/call';

export type AudioRoute = 'BLUETOOTH' | 'EARPIECE' | 'SPEAKER_PHONE' | 'WIRED_HEADSET';

export type AudioRouteState = {
  available: AudioRoute[];
  selected: AudioRoute | '';
};

type NativeAudioRouteState = {
  availableAudioDeviceList?: string;
  selectedAudioDevice?: string;
};

function isAudioRoute(value: string): value is AudioRoute {
  return (
    value === 'BLUETOOTH' ||
    value === 'EARPIECE' ||
    value === 'SPEAKER_PHONE' ||
    value === 'WIRED_HEADSET'
  );
}

function parseAvailableRoutes(value: string | undefined) {
  if (!value) {
    return [] as AudioRoute[];
  }

  try {
    const parsed = JSON.parse(value) as string[];
    return parsed.filter(isAudioRoute);
  } catch {
    return [];
  }
}

export function parseAudioRouteState(payload: NativeAudioRouteState | null | undefined): AudioRouteState {
  const selected = payload?.selectedAudioDevice;

  return {
    available: parseAvailableRoutes(payload?.availableAudioDeviceList),
    selected: selected && isAudioRoute(selected) ? selected : '',
  };
}

export function startCallAudio(mode: CallMode) {
  InCallManager.start({
    auto: true,
    media: mode === 'video' ? 'video' : 'audio',
  });
}

export function stopCallAudio() {
  InCallManager.stop();
}

export async function chooseAudioRoute(route: AudioRoute) {
  const result = await InCallManager.chooseAudioRoute(route);
  return parseAudioRouteState(result);
}

export function subscribeToAudioRouteChanges(
  onChange: (state: AudioRouteState) => void
) {
  const subscriptions: EmitterSubscription[] = [
    DeviceEventEmitter.addListener('onAudioDeviceChanged', (payload: NativeAudioRouteState) => {
      onChange(parseAudioRouteState(payload));
    }),
    DeviceEventEmitter.addListener('WiredHeadset', () => {
      // Let the native route update event drive the actual UI state.
    }),
  ];

  return () => {
    subscriptions.forEach((subscription) => subscription.remove());
  };
}
