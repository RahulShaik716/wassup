import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';

import { useSession } from '@/src/features/auth/session-context';
import { registerForPushNotificationsAsync } from '@/src/lib/push-notifications';
import { socket } from '@/src/lib/socket';

type PushRouteData = {
  type?: unknown;
  chatUserId?: unknown;
  username?: unknown;
  callId?: unknown;
  mode?: unknown;
};

function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function handleNotificationNavigation(data: PushRouteData) {
  const type = readString(data.type);

  if (type !== 'message' && type !== 'call') {
    return;
  }

  const chatId = readString(data.chatUserId);

  if (!chatId) {
    return;
  }

  router.push({
    pathname: '/chat/[chatId]',
    params: {
      chatId,
      name: readString(data.username) ?? chatId,
      username: readString(data.username) ?? chatId,
      callId: readString(data.callId),
      mode: readString(data.mode),
    },
  });
}

export function PushNotificationsProvider({ children }: PropsWithChildren) {
  const { isHydrating, user } = useSession();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [pendingNavigationData, setPendingNavigationData] = useState<PushRouteData | null>(null);
  const lastHandledNotificationIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function register() {
      if (!user) {
        setExpoPushToken(null);
        return;
      }

      try {
        const token = await registerForPushNotificationsAsync();

        if (isMounted) {
          console.log('[push] Registration finished for user:', user.username, 'token:', token);
          setExpoPushToken(token);
        }
      } catch (error) {
        console.warn('Push registration failed', error);
      }
    }

    void register();

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !expoPushToken) {
      return;
    }

    const currentUser = user;

    function syncPushToken() {
      console.log('[push] Sending push token to server for user:', currentUser.username);
      socket.emit(
        'push:register',
        {
          userId: currentUser.id,
          token: expoPushToken,
        },
        (response: unknown) => {
          console.log('[push] Server push:register ack:', response);
        }
      );
    }

    socket.on('connect', syncPushToken);

    if (socket.connected) {
      syncPushToken();
    }

    return () => {
      socket.off('connect', syncPushToken);

      if (socket.connected) {
        socket.emit(
          'push:unregister',
          {
            userId: currentUser.id,
            token: expoPushToken,
          },
          (response: unknown) => {
            console.log('[push] Server push:unregister ack:', response);
          }
        );
      }
    };
  }, [expoPushToken, user]);

  useEffect(() => {
    if (isHydrating || !pendingNavigationData) {
      return;
    }

    if (!user) {
      setPendingNavigationData(null);
      return;
    }

    if (readString(pendingNavigationData.type) === 'call' && !socket.connected) {
      console.log('[push] Reconnecting socket before handling call notification tap');
      socket.connect();
    }

    handleNotificationNavigation(pendingNavigationData);
    setPendingNavigationData(null);
  }, [isHydrating, pendingNavigationData, user]);

  useEffect(() => {
    async function hydrateLastNotificationResponse() {
      const response = await Notifications.getLastNotificationResponseAsync();

      if (!response) {
        return;
      }

      lastHandledNotificationIdRef.current = response.notification.request.identifier;
      setPendingNavigationData(response.notification.request.content.data as PushRouteData);
      await Notifications.clearLastNotificationResponseAsync();
    }

    function handleResponse(response: Notifications.NotificationResponse) {
      console.log(
        '[push] Notification response received:',
        response.notification.request.content.data
      );

      if (lastHandledNotificationIdRef.current === response.notification.request.identifier) {
        return;
      }

      lastHandledNotificationIdRef.current = response.notification.request.identifier;
      setPendingNavigationData(response.notification.request.content.data as PushRouteData);
      void Notifications.clearLastNotificationResponseAsync();
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);

    void hydrateLastNotificationResponse();

    return () => {
      subscription.remove();
    };
  }, []);

  return children;
}
