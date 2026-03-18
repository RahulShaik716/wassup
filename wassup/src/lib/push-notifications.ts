import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const MESSAGE_NOTIFICATION_CHANNEL_ID = 'wassup-messages';
export const CALL_NOTIFICATION_CHANNEL_ID = 'wassup-calls';

type ForegroundMessageToneData = {
  kind: 'foreground-message-tone';
};

type RemotePushData = {
  type?: 'message' | 'call';
};

function isForegroundMessageToneData(value: unknown): value is ForegroundMessageToneData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'foreground-message-tone'
  );
}

function isRemotePushData(value: unknown): value is RemotePushData {
  return typeof value === 'object' && value !== null && 'type' in value;
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;

    if (isForegroundMessageToneData(data)) {
      return {
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      };
    }

    if (isRemotePushData(data) && data.type === 'message') {
      return {
        shouldPlaySound: false,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    }

    return {
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    };
  },
});

let areChannelsConfigured = false;
let lastForegroundToneAt = 0;

async function configureNotificationChannelsAsync() {
  if (Platform.OS !== 'android' || areChannelsConfigured) {
    return;
  }

  await Notifications.setNotificationChannelAsync(MESSAGE_NOTIFICATION_CHANNEL_ID, {
    name: 'Messages',
    description: 'Message notifications and alert tone',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    showBadge: true,
    enableLights: true,
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    vibrationPattern: [0, 120, 60, 160],
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.NOTIFICATION_COMMUNICATION_INSTANT,
    },
  });

  await Notifications.setNotificationChannelAsync(CALL_NOTIFICATION_CHANNEL_ID, {
    name: 'Calls',
    description: 'Incoming call alerts',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    showBadge: true,
    enableLights: true,
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    vibrationPattern: [0, 300, 200, 300],
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
    },
  });

  areChannelsConfigured = true;
}

function resolveProjectId() {
  const easProjectId =
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.manifest2?.extra?.expoClient?.extra?.eas?.projectId;

  return typeof easProjectId === 'string' ? easProjectId : null;
}

export async function registerForPushNotificationsAsync() {
  await configureNotificationChannelsAsync();

  if (!Device.isDevice) {
    console.log('[push] Not a physical device. Skipping push registration.');
    return null;
  }

  let settings = await Notifications.getPermissionsAsync();
  console.log('[push] Existing notification permission status:', settings.status);

  if (settings.status !== 'granted') {
    settings = await Notifications.requestPermissionsAsync();
    console.log('[push] Permission request result:', settings.status);
  }

  if (settings.status !== 'granted') {
    console.log('[push] Permission not granted. No Expo push token will be created.');
    return null;
  }

  const projectId = resolveProjectId();

  if (!projectId) {
    console.warn('Missing Expo projectId. Push registration skipped.');
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  console.log('[push] Expo push token acquired:', token.data);
  return token.data;
}

export async function playForegroundMessageNotificationToneAsync() {
  const now = Date.now();

  if (now - lastForegroundToneAt < 900) {
    return true;
  }

  await configureNotificationChannelsAsync();

  const settings = await Notifications.getPermissionsAsync();

  if (settings.status !== 'granted') {
    return false;
  }

  lastForegroundToneAt = now;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'New message',
      body: ' ',
      sound: 'default',
      data: { kind: 'foreground-message-tone' },
      ...(Platform.OS === 'android'
        ? { channelId: MESSAGE_NOTIFICATION_CHANNEL_ID }
        : null),
    },
    trigger: null,
  });

  return true;
}
