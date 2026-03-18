import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

import {
  addStoredContact,
  createStoredMessage,
  getStoredChatMessages,
  hasStoredContact,
  listStoredCallsForUser,
  listStoredContacts,
  persistCallRecord,
  searchStoredDirectory,
  updateStoredCallStatus,
  upsertPublicUser,
} from './data/store.js';

const PORT = Number(process.env.PORT ?? 3001);
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MESSAGE_NOTIFICATION_CHANNEL_ID = 'wassup-messages';
const CALL_NOTIFICATION_CHANNEL_ID = 'wassup-calls';
const CALL_RINGING_TIMEOUT_MS = 45_000;

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

type PublicUser = {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  username: string;
};

type JoinPayload = {
  userId: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  username: string;
};

type PushRegisterPayload = {
  userId: string;
  token: string;
};

type DirectorySearchPayload = {
  query?: string;
};

type ContactActionPayload = {
  targetUserId: string;
};

type ChatJoinPayload = {
  chatId: string;
};

type ChatSendPayload = {
  chatId: string;
  text: string;
  senderId: string;
  senderName: string;
};

type ChatMessage = {
  id: string;
  chatId: string;
  text: string;
  senderId: string;
  senderName: string;
  createdAt: string;
};

type CallMode = 'voice' | 'video';

type CallPayload = {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  mode: CallMode;
};

type CallActionPayload = {
  callId: string;
};

type CallRecord = {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  mode: CallMode;
  status: 'ringing' | 'active';
  createdAt: string;
};

type ConnectedUser = {
  socketId: string;
  user: PublicUser;
};

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound?: 'default';
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  ttl?: number;
  data?: Record<string, string>;
};

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'wassup-server',
    now: new Date().toISOString(),
  });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const users = new Map<string, ConnectedUser>();
const pushTokensByUser = new Map<string, Set<string>>();
const calls = new Map<string, CallRecord>();
const readyUsersByCall = new Map<string, Set<string>>();
const callTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function buildFallbackUsername(input: {
  username?: string | null;
  name?: string | null;
  email?: string | null;
  id?: string | null;
}) {
  const base =
    input.username?.trim() ||
    input.email?.split('@')[0]?.trim() ||
    input.name?.trim().split(/\s+/).join('_') ||
    input.id?.trim() ||
    'user';

  return base
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'user';
}

function emitToUser(userId: string, event: string, payload: unknown) {
  const socketId = users.get(userId)?.socketId;

  if (socketId) {
    io.to(socketId).emit(event, payload);
  }
}

function getOtherUserId(call: CallRecord, currentUserId: string) {
  return currentUserId === call.fromUserId ? call.toUserId : call.fromUserId;
}

function listOnlineUsers() {
  return Array.from(users.values()).map(({ user }) => user);
}

function isExpoPushToken(token: string) {
  return /^ExponentPushToken\[.+\]$/.test(token) || /^ExpoPushToken\[.+\]$/.test(token);
}

function rememberPushToken(userId: string, token: string) {
  for (const [ownerUserId, tokens] of pushTokensByUser.entries()) {
    if (ownerUserId === userId) {
      continue;
    }

    if (tokens.delete(token) && tokens.size === 0) {
      pushTokensByUser.delete(ownerUserId);
    }
  }

  const tokens = pushTokensByUser.get(userId) ?? new Set<string>();
  tokens.add(token);
  pushTokensByUser.set(userId, tokens);
}

function forgetPushToken(token: string, userId?: string) {
  if (userId) {
    const tokens = pushTokensByUser.get(userId);

    if (!tokens) {
      return;
    }

    tokens.delete(token);

    if (tokens.size === 0) {
      pushTokensByUser.delete(userId);
    }

    return;
  }

  for (const [ownerUserId, tokens] of pushTokensByUser.entries()) {
    if (tokens.delete(token) && tokens.size === 0) {
      pushTokensByUser.delete(ownerUserId);
    }
  }
}

function getPushTokensForUsers(userIds: string[]) {
  return Array.from(
    new Set(
      userIds.flatMap((userId) => {
        return Array.from(pushTokensByUser.get(userId) ?? []);
      })
    )
  );
}

function getChatRecipientUserIds(chatId: string, senderId: string) {
  return chatId.split('--').filter((userId) => userId && userId !== senderId);
}

function getPendingIncomingCallsForUser(userId: string) {
  return Array.from(calls.values())
    .filter((call) => call.status === 'ringing' && call.toUserId === userId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function clearCallTimeout(callId: string) {
  const timeout = callTimeouts.get(callId);

  if (!timeout) {
    return;
  }

  clearTimeout(timeout);
  callTimeouts.delete(callId);
}

function emitCallEvent(call: CallRecord, event: string) {
  emitToUser(call.fromUserId, event, call);
  emitToUser(call.toUserId, event, call);
}

function disposeCall(callId: string) {
  clearCallTimeout(callId);
  calls.delete(callId);
  readyUsersByCall.delete(callId);
}

function scheduleCallTimeout(call: CallRecord) {
  clearCallTimeout(call.id);

  const timeout = setTimeout(() => {
    const latestCall = calls.get(call.id);

    if (!latestCall || latestCall.status !== 'ringing') {
      return;
    }

    emitCallEvent(latestCall, 'call:missed');
    void updateStoredCallStatus(latestCall.id, 'missed').catch((error) => {
      console.error('Failed to persist missed call status', error);
    });
    disposeCall(latestCall.id);
  }, CALL_RINGING_TIMEOUT_MS);

  callTimeouts.set(call.id, timeout);
}

async function sendPushNotifications(messages: ExpoPushMessage[]) {
  if (messages.length === 0) {
    console.log('[push] No recipient tokens. Skipping Expo push request.');
    return;
  }

  try {
    console.log(
      '[push] Sending Expo push messages:',
      messages.map((message) => ({
        to: message.to,
        title: message.title,
        channelId: message.channelId,
        data: message.data,
      }))
    );

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const responseBody = await response.text();
    console.log('[push] Expo push response status:', response.status);
    console.log('[push] Expo push response body:', responseBody);

    if (!response.ok) {
      console.error('Expo push request failed', response.status, responseBody);
    }
  } catch (error) {
    console.error('Expo push request failed', error);
  }
}

io.on('connection', (socket) => {
  console.log('connected', socket.id);
  socket.data.deliveredIncomingCallIds = new Set<string>();

  socket.on('user:join', async (payload: JoinPayload, ack?: (response: unknown) => void) => {
    if (!payload?.userId) {
      ack?.({ ok: false, error: 'userId is required' });
      return;
    }

    const nextUser: PublicUser = {
      id: payload.userId,
      name: payload.name,
      email: payload.email,
      avatarUrl: payload.avatarUrl,
      username: buildFallbackUsername({
        username: payload.username,
        name: payload.name,
        email: payload.email,
        id: payload.userId,
      }),
    };

    await upsertPublicUser(nextUser);
    users.set(payload.userId, {
      socketId: socket.id,
      user: nextUser,
    });
    socket.data.userId = payload.userId;
    socket.data.name = payload.name;

    ack?.({ ok: true, socketId: socket.id, users: listOnlineUsers() });

    io.emit('presence:update', {
      user: nextUser,
      isOnline: true,
    });

    const deliveredIncomingCallIds = socket.data.deliveredIncomingCallIds as Set<string>;
    const pendingIncomingCalls = getPendingIncomingCallsForUser(payload.userId);

    for (const pendingCall of pendingIncomingCalls) {
      if (deliveredIncomingCallIds.has(pendingCall.id)) {
        continue;
      }

      deliveredIncomingCallIds.add(pendingCall.id);
      emitToUser(payload.userId, 'call:incoming', pendingCall);
    }
  });

  socket.on('push:register', (payload: PushRegisterPayload, ack?: (response: unknown) => void) => {
    if (!payload?.userId || !payload?.token) {
      ack?.({ ok: false, error: 'userId and token are required' });
      return;
    }

    if (!isExpoPushToken(payload.token)) {
      ack?.({ ok: false, error: 'Invalid Expo push token' });
      return;
    }

    rememberPushToken(payload.userId, payload.token);
    console.log('[push] Registered token for user:', payload.userId, payload.token);
    ack?.({ ok: true });
  });

  socket.on(
    'push:unregister',
    (payload: PushRegisterPayload, ack?: (response: unknown) => void) => {
      if (!payload?.token) {
        ack?.({ ok: false, error: 'token is required' });
        return;
      }

      forgetPushToken(payload.token, payload.userId);
      console.log('[push] Unregistered token for user:', payload.userId, payload.token);
      ack?.({ ok: true });
    }
  );

  socket.on('users:list', (ack?: (response: unknown) => void) => {
    ack?.({
      ok: true,
      users: listOnlineUsers(),
    });
  });

  socket.on('calls:list', async (ack?: (response: unknown) => void) => {
    const currentUserId = socket.data.userId as string | undefined;

    if (!currentUserId) {
      ack?.({ ok: false, error: 'Not authenticated' });
      return;
    }

    ack?.({
      ok: true,
      calls: await listStoredCallsForUser(currentUserId),
    });
  });

  socket.on('contacts:list', async (ack?: (response: unknown) => void) => {
    const currentUserId = socket.data.userId as string | undefined;

    if (!currentUserId) {
      ack?.({ ok: false, error: 'Not authenticated' });
      return;
    }

    ack?.({
      ok: true,
      contacts: await listStoredContacts(currentUserId, new Set(users.keys())),
    });
  });

  socket.on(
    'directory:search',
    async (payload: DirectorySearchPayload, ack?: (response: unknown) => void) => {
      const currentUserId = socket.data.userId as string | undefined;

      if (!currentUserId) {
        ack?.({ ok: false, error: 'Not authenticated' });
        return;
      }

      ack?.({
        ok: true,
        users: await searchStoredDirectory(
          currentUserId,
          payload?.query ?? '',
          new Set(users.keys())
        ),
      });
    }
  );

  socket.on(
    'contacts:add',
    async (payload: ContactActionPayload, ack?: (response: unknown) => void) => {
      const currentUserId = socket.data.userId as string | undefined;

      if (!currentUserId) {
        ack?.({ ok: false, error: 'Not authenticated' });
        return;
      }

      if (!payload?.targetUserId) {
        ack?.({ ok: false, error: 'targetUserId is required' });
        return;
      }

      if (payload.targetUserId === currentUserId) {
        ack?.({ ok: false, error: 'You cannot add yourself' });
        return;
      }

      const targetUser = await addStoredContact(
        currentUserId,
        payload.targetUserId,
        new Set(users.keys())
      );

      if (!targetUser) {
        ack?.({ ok: false, error: 'User not found' });
        return;
      }

      ack?.({
        ok: true,
        contact: targetUser,
      });
    }
  );

  socket.on('chat:join', async (payload: ChatJoinPayload, ack?: (response: unknown) => void) => {
    const currentUserId = socket.data.userId as string | undefined;

    if (!payload?.chatId) {
      ack?.({ ok: false, error: 'chatId is required' });
      return;
    }

    if (!currentUserId) {
      ack?.({ ok: false, error: 'Not authenticated' });
      return;
    }

    const participantIds = payload.chatId.split('--').filter(Boolean);

    if (!participantIds.includes(currentUserId)) {
      ack?.({ ok: false, error: 'Invalid chat' });
      return;
    }

    const otherParticipantIds = participantIds.filter((participantId) => participantId !== currentUserId);
    const canJoin = await Promise.all(
      otherParticipantIds.map((participantId) => hasStoredContact(currentUserId, participantId))
    );

    if (canJoin.some((isAllowed) => !isAllowed)) {
      ack?.({ ok: false, error: 'Add this user before opening the chat' });
      return;
    }

    socket.join(payload.chatId);

    ack?.({
      ok: true,
      messages: await getStoredChatMessages(payload.chatId),
    });
  });

  socket.on('chat:leave', (payload: ChatJoinPayload) => {
    if (payload?.chatId) {
      socket.leave(payload.chatId);
    }
  });

  socket.on('chat:send', async (payload: ChatSendPayload, ack?: (response: unknown) => void) => {
    const text = payload?.text?.trim();
    const currentUserId = socket.data.userId as string | undefined;

    if (!payload?.chatId) {
      ack?.({ ok: false, error: 'chatId is required' });
      return;
    }

    if (!payload?.senderId) {
      ack?.({ ok: false, error: 'senderId is required' });
      return;
    }

    if (!currentUserId || currentUserId !== payload.senderId) {
      ack?.({ ok: false, error: 'Invalid sender' });
      return;
    }

    if (!text) {
      ack?.({ ok: false, error: 'text is required' });
      return;
    }

    const recipientUserIds = getChatRecipientUserIds(payload.chatId, payload.senderId);

    const contactChecks = await Promise.all(
      recipientUserIds.map((recipientUserId) =>
        hasStoredContact(payload.senderId, recipientUserId)
      )
    );

    if (contactChecks.some((isAllowed) => !isAllowed)) {
      ack?.({ ok: false, error: 'Add this user before sending messages' });
      return;
    }

    const message = await createStoredMessage({
      id: randomUUID(),
      chatId: payload.chatId,
      text,
      senderId: payload.senderId,
      senderName: payload.senderName,
      createdAt: new Date().toISOString(),
    });

    io.to(payload.chatId).emit('chat:message', message);
    ack?.({ ok: true, message });

    const sender = users.get(payload.senderId)?.user;
    const recipientTokens = getPushTokensForUsers(recipientUserIds);

    void sendPushNotifications(
      recipientTokens.map((token) => ({
        to: token,
        title: payload.senderName,
        body: text,
        sound: 'default',
        channelId: MESSAGE_NOTIFICATION_CHANNEL_ID,
        priority: 'high',
        ttl: 60 * 30,
        data: {
          type: 'message',
          chatUserId: payload.senderId,
          name: payload.senderName,
          username: sender?.username ?? payload.senderId,
          email: sender?.email ?? '',
        },
      }))
    );
  });

  socket.on('call:invite', async (payload: CallPayload, ack?: (response: unknown) => void) => {
    const currentUserId = socket.data.userId as string | undefined;

    if (!payload?.fromUserId || !payload?.toUserId) {
      ack?.({ ok: false, error: 'Both users are required' });
      return;
    }

    if (!currentUserId || currentUserId !== payload.fromUserId) {
      ack?.({ ok: false, error: 'Invalid caller' });
      return;
    }

    if (payload.fromUserId === payload.toUserId) {
      ack?.({ ok: false, error: 'Cannot call yourself' });
      return;
    }

    if (!(await hasStoredContact(payload.fromUserId, payload.toUserId))) {
      ack?.({ ok: false, error: 'Add this user before calling' });
      return;
    }

    const recipientIsOnline = users.has(payload.toUserId);
    const recipientTokens = getPushTokensForUsers([payload.toUserId]);

    if (!recipientIsOnline && recipientTokens.length === 0) {
      ack?.({ ok: false, error: 'Recipient is unavailable' });
      return;
    }

    const call: CallRecord = {
      id: randomUUID(),
      fromUserId: payload.fromUserId,
      fromUserName: payload.fromUserName,
      toUserId: payload.toUserId,
      toUserName: payload.toUserName,
      mode: payload.mode,
      status: 'ringing',
      createdAt: new Date().toISOString(),
    };

    calls.set(call.id, call);
    readyUsersByCall.set(call.id, new Set());
    scheduleCallTimeout(call);
    await persistCallRecord(call);

    if (recipientIsOnline) {
      emitToUser(call.toUserId, 'call:incoming', call);
    }

    ack?.({ ok: true, call });

    const caller = users.get(payload.fromUserId)?.user;

    void sendPushNotifications(
      recipientTokens.map((token) => ({
        to: token,
        title: `${payload.fromUserName} is calling`,
        body: payload.mode === 'video' ? 'Incoming video call on Wassup' : 'Incoming voice call on Wassup',
        sound: 'default',
        channelId: CALL_NOTIFICATION_CHANNEL_ID,
        priority: 'high',
        ttl: 60,
        data: {
          type: 'call',
          chatUserId: payload.fromUserId,
          name: payload.fromUserName,
          username: caller?.username ?? payload.fromUserId,
          email: caller?.email ?? '',
          callId: call.id,
          mode: payload.mode,
        },
      }))
    );
  });

  socket.on('call:accept', async (payload: CallActionPayload, ack?: (response: unknown) => void) => {
    const call = calls.get(payload?.callId);

    if (!call) {
      ack?.({ ok: false, error: 'Call not found' });
      return;
    }

    if (socket.data.userId !== call.toUserId) {
      ack?.({ ok: false, error: 'Only the callee can accept' });
      return;
    }

    call.status = 'active';
    calls.set(call.id, call);
    clearCallTimeout(call.id);
    await updateStoredCallStatus(call.id, 'active');

    emitToUser(call.fromUserId, 'call:accepted', call);
    emitToUser(call.toUserId, 'call:accepted', call);
    ack?.({ ok: true, call });
  });

  socket.on('call:reject', async (payload: CallActionPayload, ack?: (response: unknown) => void) => {
    const call = calls.get(payload?.callId);

    if (!call) {
      ack?.({ ok: false, error: 'Call not found' });
      return;
    }

    emitCallEvent(call, 'call:rejected');
    await updateStoredCallStatus(call.id, 'rejected');
    disposeCall(call.id);
    ack?.({ ok: true });
  });

  socket.on('call:end', async (payload: CallActionPayload) => {
    const call = calls.get(payload?.callId);

    if (!call) {
      return;
    }

    emitCallEvent(call, 'call:ended');
    await updateStoredCallStatus(call.id, 'ended');
    disposeCall(call.id);
  });

  socket.on('call:ready', (payload: CallActionPayload, ack?: (response: unknown) => void) => {
    const call = calls.get(payload?.callId);
    const currentUserId = socket.data.userId as string | undefined;

    if (!call || !currentUserId) {
      ack?.({ ok: false, error: 'Call not found' });
      return;
    }

    const readyUsers = readyUsersByCall.get(call.id) ?? new Set<string>();
    readyUsers.add(currentUserId);
    readyUsersByCall.set(call.id, readyUsers);

    if (readyUsers.has(call.fromUserId) && readyUsers.has(call.toUserId)) {
      emitToUser(call.fromUserId, 'call:ready', { callId: call.id });
      emitToUser(call.toUserId, 'call:ready', { callId: call.id });
    }

    ack?.({ ok: true, readyCount: readyUsers.size });
  });

  socket.on('webrtc:offer', (payload: SessionDescriptionPayload, ack?: (response: unknown) => void) => {
    const call = calls.get(payload?.callId);
    const currentUserId = socket.data.userId as string | undefined;

    if (!call || !currentUserId) {
      ack?.({ ok: false, error: 'Call not found' });
      return;
    }

    if (call.status !== 'active') {
      ack?.({ ok: false, error: 'Call is not active yet' });
      return;
    }

    emitToUser(getOtherUserId(call, currentUserId), 'webrtc:offer', payload);
    ack?.({ ok: true });
  });

  socket.on('webrtc:answer', (payload: SessionDescriptionPayload, ack?: (response: unknown) => void) => {
    const call = calls.get(payload?.callId);
    const currentUserId = socket.data.userId as string | undefined;

    if (!call || !currentUserId) {
      ack?.({ ok: false, error: 'Call not found' });
      return;
    }

    emitToUser(getOtherUserId(call, currentUserId), 'webrtc:answer', payload);
    ack?.({ ok: true });
  });

  socket.on(
    'webrtc:ice-candidate',
    (payload: IceCandidatePayload, ack?: (response: unknown) => void) => {
      const call = calls.get(payload?.callId);
      const currentUserId = socket.data.userId as string | undefined;

      if (!call || !currentUserId) {
        ack?.({ ok: false, error: 'Call not found' });
        return;
      }

      emitToUser(getOtherUserId(call, currentUserId), 'webrtc:ice-candidate', payload);
      ack?.({ ok: true });
    }
  );

  socket.on('disconnect', async () => {
    const userId = socket.data.userId as string | undefined;

    if (userId) {
      const disconnectedUser = users.get(userId)?.user;
      users.delete(userId);

      for (const call of Array.from(calls.values())) {
        if (call.status === 'active' && (call.fromUserId === userId || call.toUserId === userId)) {
          emitCallEvent(call, 'call:ended');
          await updateStoredCallStatus(call.id, 'ended');
          disposeCall(call.id);
          continue;
        }

        if (call.status === 'ringing' && call.fromUserId === userId) {
          emitCallEvent(call, 'call:ended');
          await updateStoredCallStatus(call.id, 'ended');
          disposeCall(call.id);
          continue;
        }

        if (call.status === 'ringing' && call.toUserId === userId) {
          readyUsersByCall.get(call.id)?.delete(userId);
        }
      }

      io.emit('presence:update', {
        user: disconnectedUser ?? {
          id: userId,
          name: (socket.data.name as string) ?? userId,
          username: userId,
        },
        isOnline: false,
      });
    }

    console.log('disconnected', socket.id);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP: http://localhost:${PORT}`);
  console.log(`Socket.IO ready on port ${PORT}`);
});
