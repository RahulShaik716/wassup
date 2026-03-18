import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';

import { useSession } from '@/src/features/auth/session-context';
import {
  CALL_ACCEPT_ACTION_ID,
  CALL_DECLINE_ACTION_ID,
  registerForPushNotificationsAsync,
} from '@/src/lib/push-notifications';
import { socket } from '@/src/lib/socket';

type PushRouteData = {
  type?: unknown;
  chatUserId?: unknown;
  username?: unknown;
  callId?: unknown;
  mode?: unknown;
};

type PendingNotificationIntent = {
  actionIdentifier: string;
  data: PushRouteData;
};

const SOCKET_ACK_TIMEOUT_MS = 5_000;

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
  const [pendingNotificationIntent, setPendingNotificationIntent] =
    useState<PendingNotificationIntent | null>(null);
  const lastHandledNotificationIdRef = useRef<string | null>(null);

  const waitForSocketConnection = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      if (socket.connected) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        socket.off('connect', handleConnect);
        socket.off('connect_error', handleConnectError);
        reject(new Error('Socket connection timed out'));
      }, SOCKET_ACK_TIMEOUT_MS);

      function handleConnect() {
        clearTimeout(timeout);
        socket.off('connect_error', handleConnectError);
        resolve();
      }

      function handleConnectError() {
        clearTimeout(timeout);
        socket.off('connect', handleConnect);
        reject(new Error('Socket connection failed'));
      }

      socket.once('connect', handleConnect);
      socket.once('connect_error', handleConnectError);
      socket.connect();
    });
  }, []);

  const emitAck = useCallback(<TResponse,>(event: string, payload?: Record<string, unknown>) => {
    return new Promise<TResponse>((resolve, reject) => {
      const callback = (error: Error | null, response: TResponse) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(response);
      };

      if (payload) {
        socket.timeout(SOCKET_ACK_TIMEOUT_MS).emit(event, payload, callback);
        return;
      }

      socket.timeout(SOCKET_ACK_TIMEOUT_MS).emit(event, callback);
    });
  }, []);

  const ensureJoinedCurrentUser = useCallback(async () => {
    if (!user) {
      throw new Error('Cannot join socket without a signed-in user');
    }

    await waitForSocketConnection();
    await emitAck<{ ok: boolean; error?: string }>('user:join', {
      userId: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      username: user.username,
    });
  }, [emitAck, user, waitForSocketConnection]);

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
    if (isHydrating || !pendingNotificationIntent) {
      return;
    }

    if (!user) {
      setPendingNotificationIntent(null);
      return;
    }

    const intent = pendingNotificationIntent;

    async function handlePendingIntent() {
      const { actionIdentifier, data } = intent;
      const type = readString(data.type);
      const callId = readString(data.callId);

      try {
        if (type === 'call') {
          console.log('[push] Reconnecting and joining socket before handling call notification');
          await ensureJoinedCurrentUser();

          if (actionIdentifier === CALL_ACCEPT_ACTION_ID && callId) {
            await emitAck<{ ok: boolean; error?: string }>('call:accept', { callId });
            return;
          }

          if (actionIdentifier === CALL_DECLINE_ACTION_ID && callId) {
            await emitAck<{ ok: boolean; error?: string }>('call:reject', { callId });
            return;
          }
        }

        handleNotificationNavigation(data);
      } catch (error) {
        console.warn('[push] Notification action failed', error);
      } finally {
        setPendingNotificationIntent(null);
      }
    }

    void handlePendingIntent();
  }, [emitAck, ensureJoinedCurrentUser, isHydrating, pendingNotificationIntent, user]);

  useEffect(() => {
    async function hydrateLastNotificationResponse() {
      const response = await Notifications.getLastNotificationResponseAsync();

      if (!response) {
        return;
      }

      lastHandledNotificationIdRef.current = response.notification.request.identifier;
      setPendingNotificationIntent({
        actionIdentifier: response.actionIdentifier,
        data: response.notification.request.content.data as PushRouteData,
      });
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
      setPendingNotificationIntent({
        actionIdentifier: response.actionIdentifier,
        data: response.notification.request.content.data as PushRouteData,
      });
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
