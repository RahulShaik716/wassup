import InCallManager from 'react-native-incall-manager';

import { playForegroundMessageNotificationToneAsync } from '@/src/lib/push-notifications';

let isIncomingCallRinging = false;
let isOutgoingRingbackPlaying = false;

export async function playIncomingCallRingtone() {
  if (isIncomingCallRinging) {
    return;
  }

  stopMessageTone();
  isIncomingCallRinging = true;
  InCallManager.startRingtone('_DEFAULT_', [0, 250, 120], 'default', 0);
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

  await playForegroundMessageNotificationToneAsync();
}

export function stopMessageTone() {
  // Foreground message alerts are delivered through the system notification channel.
}

export function stopAllNotificationSounds() {
  stopIncomingCallRingtone();
  stopOutgoingRingback();
  stopMessageTone();
}
