import cors from 'cors';
  import express from 'express';
  import { randomUUID } from 'node:crypto';
  import { createServer } from 'node:http';
  import { Server } from 'socket.io';

  const PORT = Number(process.env.PORT ?? 3001);


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

  type JoinPayload = {
    userId: string;
    name: string;
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

  const users = new Map<string, string>();
  const messagesByChat = new Map<string, ChatMessage[]>();
  const calls = new Map<string, CallRecord>();
  const readyUsersByCall = new Map<string, Set<string>>();

  function getChatMessages(chatId: string) {
    return messagesByChat.get(chatId) ?? [];
  }

  function emitToUser(userId: string, event: string, payload: unknown) {
    const socketId = users.get(userId);

    if (socketId) {
      io.to(socketId).emit(event, payload);
    }
  }

  function getOtherUserId(call: CallRecord, currentUserId: string) {
    return currentUserId === call.fromUserId ? call.toUserId : call.fromUserId;
  }


  io.on('connection', (socket) => {
    console.log('connected', socket.id);

    socket.on('user:join', (payload: JoinPayload, ack?: (response: unknown) => void) => {
      if (!payload?.userId) {
        ack?.({ ok: false, error: 'userId is required' });
        return;
      }

      users.set(payload.userId, socket.id);
      socket.data.userId = payload.userId;
      socket.data.name = payload.name;

      ack?.({ ok: true, socketId: socket.id });

      io.emit('presence:update', {
        userId: payload.userId,
        isOnline: true,
      });
    });

    socket.on('chat:join', (payload: ChatJoinPayload, ack?: (response: unknown) => void) => {
      if (!payload?.chatId) {
        ack?.({ ok: false, error: 'chatId is required' });
        return;
      }

      socket.join(payload.chatId);

      ack?.({
        ok: true,
        messages: getChatMessages(payload.chatId),
      });
    });

    socket.on('chat:leave', (payload: ChatJoinPayload) => {
      if (payload?.chatId) {
        socket.leave(payload.chatId);
      }
    });

    socket.on('chat:send', (payload: ChatSendPayload, ack?: (response: unknown) => void) => {
      const text = payload?.text?.trim();

      if (!payload?.chatId) {
        ack?.({ ok: false, error: 'chatId is required' });
        return;
      }

      if (!payload?.senderId) {
        ack?.({ ok: false, error: 'senderId is required' });
        return;
      }

      if (!text) {
        ack?.({ ok: false, error: 'text is required' });
        return;
      }

      const message: ChatMessage = {
        id: randomUUID(),
        chatId: payload.chatId,
        text,
        senderId: payload.senderId,
        senderName: payload.senderName,
        createdAt: new Date().toISOString(),
      };

      messagesByChat.set(payload.chatId, [...getChatMessages(payload.chatId), message]);

      io.to(payload.chatId).emit('chat:message', message);
      ack?.({ ok: true, message });
    });

    socket.on('call:invite', (payload: CallPayload, ack?: (response: unknown) => void) => {
      if (!payload?.fromUserId || !payload?.toUserId) {
        ack?.({ ok: false, error: 'Both users are required' });
        return;
      }

      if (payload.fromUserId === payload.toUserId) {
        ack?.({ ok: false, error: 'Cannot call yourself' });
        return;
      }

      if (!users.has(payload.toUserId)) {
        ack?.({ ok: false, error: 'Recipient is offline' });
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
      emitToUser(call.toUserId, 'call:incoming', call);
      ack?.({ ok: true, call });
    });

    socket.on('call:accept', (payload: CallActionPayload, ack?: (response: unknown) => void) => {
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

      emitToUser(call.fromUserId, 'call:accepted', call);
      emitToUser(call.toUserId, 'call:accepted', call);
      ack?.({ ok: true, call });
    });

    socket.on('call:reject', (payload: CallActionPayload, ack?: (response: unknown) => void) => {
      const call = calls.get(payload?.callId);

      if (!call) {
        ack?.({ ok: false, error: 'Call not found' });
        return;
      }

      emitToUser(call.fromUserId, 'call:rejected', call);
      emitToUser(call.toUserId, 'call:rejected', call);
      calls.delete(call.id);
      readyUsersByCall.delete(call.id);
      ack?.({ ok: true });
    });

    socket.on('call:end', (payload: CallActionPayload) => {
      const call = calls.get(payload?.callId);

      if (!call) {
        return;
      }

      emitToUser(call.fromUserId, 'call:ended', call);
      emitToUser(call.toUserId, 'call:ended', call);
      calls.delete(call.id);
      readyUsersByCall.delete(call.id);
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

  socket.on('webrtc:ice-candidate', (payload: IceCandidatePayload, ack?: (response: unknown) => void) => {
    const call = calls.get(payload?.callId);
    const currentUserId = socket.data.userId as string | undefined;

    if (!call || !currentUserId) {
      ack?.({ ok: false, error: 'Call not found' });
      return;
    }

    emitToUser(getOtherUserId(call, currentUserId), 'webrtc:ice-candidate', payload);
    ack?.({ ok: true });
  });

    socket.on('disconnect', () => {
      const userId = socket.data.userId as string | undefined;

      if (userId) {
        users.delete(userId);

        for (const call of Array.from(calls.values())) {
          if (call.fromUserId === userId || call.toUserId === userId) {
            emitToUser(call.fromUserId, 'call:ended', call);
            emitToUser(call.toUserId, 'call:ended', call);
            calls.delete(call.id);
            readyUsersByCall.delete(call.id);
          }
        }

        io.emit('presence:update', {
          userId,
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
