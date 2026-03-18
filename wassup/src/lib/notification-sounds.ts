import * as Haptics from 'expo-haptics';
import InCallManager from 'react-native-incall-manager';

import { playForegroundMessageNotificationToneAsync } from '@/src/lib/push-notifications';

let isIncomingCallRinging = false;
let isOutgoingRingbackPlaying = false;
let messageToneTimeout: ReturnType<typeof setTimeout> | null = null;

export async function playIncomingCallRingtone() {
  if (isIncomingCallRinging) {
    return;
  }

  stopMessageTone();
  isIncomingCallRinging = true;
  InCallManager.startRingtone('_DEFAULT_', [0, 250, 120], 'default', 0);
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

export function stopIncomingCallRingtone() {
  if (!isIncomingCallRinging) {
    return;
  }

  InCallManager.stopRingtone();
  isIncomingCallRinging = false;
}

export function startOutgoingRingback() {
  if (isOutgoingRingbackPlaying) {
    return;
  }

  InCallManager.startRingback('_DTMF_');
  isOutgoingRingbackPlaying = true;
}

export function stopOutgoingRingback() {
  if (!isOutgoingRingbackPlaying) {
    return;
  }

  InCallManager.stopRingback();
  isOutgoingRingbackPlaying = false;
}

export async function playMessageTone() {
  if (isIncomingCallRinging) {
    return;
  }

  stopMessageTone();

  try {
    const didUseNotificationTone = await playForegroundMessageNotificationToneAsync();

    if (!didUseNotificationTone) {
      InCallManager.startRingback('_DEFAULT_');
      messageToneTimeout = setTimeout(() => {
        InCallManager.stopRingback();
        messageToneTimeout = null;
      }, 260);
    }
  } catch {
    InCallManager.startRingback('_DEFAULT_');
    messageToneTimeout = setTimeout(() => {
      InCallManager.stopRingback();
      messageToneTimeout = null;
    }, 260);
  }

  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function stopMessageTone() {
  if (messageToneTimeout) {
    clearTimeout(messageToneTimeout);
    messageToneTimeout = null;
  }

  InCallManager.stopRingback();
}

export function stopAllNotificationSounds() {
  stopIncomingCallRingtone();
  stopOutgoingRingback();
  stopMessageTone();
}
