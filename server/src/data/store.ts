import type { CallMode, CallStatus, User } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

export type StoredUserProfileInput = {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  username: string;
};

export type StoredPublicUser = {
  id: string;
  username: string;
};

export type StoredDirectoryUser = StoredPublicUser & {
  isAdded: boolean;
};

export type StoredChatMessage = {
  id: string;
  chatId: string;
  text: string;
  senderId: string;
  senderName: string;
  createdAt: string;
};

export type PersistedCallInput = {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  mode: 'voice' | 'video';
  status: 'ringing' | 'active';
  createdAt: string;
};

export type StoredCallLogItem = {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  mode: 'voice' | 'video';
  status: 'ringing' | 'active' | 'rejected' | 'ended' | 'missed';
  createdAt: string;
  answeredAt?: string;
  endedAt?: string;
};

function toStoredPublicUser(user: User): StoredPublicUser {
  return {
    id: user.id,
    username: user.username,
  };
}

function toDirectoryUser(user: User, options: { addedContactIds?: Set<string> }): StoredDirectoryUser {
  return {
    ...toStoredPublicUser(user),
    isAdded: options.addedContactIds?.has(user.id) ?? false,
  };
}

export async function upsertPublicUser(user: StoredUserProfileInput) {
  await prisma.user.upsert({
    where: { id: user.id },
    update: {
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      username: user.username,
    },
    create: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      username: user.username,
    },
  });
}

export async function findPublicUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  return user ? toStoredPublicUser(user) : null;
}

export async function listStoredContacts(viewerUserId: string) {
  const contacts = await prisma.contact.findMany({
    where: { ownerId: viewerUserId },
    include: {
      contact: true,
    },
    orderBy: {
      contact: {
        username: 'asc',
      },
    },
  });

  return contacts.map(({ contact }) =>
    toDirectoryUser(contact, {
      addedContactIds: new Set([contact.id]),
    })
  );
}

export async function searchStoredDirectory(viewerUserId: string, query: string) {
  const normalizedQuery = query.trim();
  const existingContacts = await prisma.contact.findMany({
    where: { ownerId: viewerUserId },
    select: { contactId: true },
  });
  const addedContactIds = new Set(existingContacts.map((contact) => contact.contactId));

  const users = await prisma.user.findMany({
    where: {
      id: { not: viewerUserId },
      ...(normalizedQuery
        ? {
            OR: [
              {
                username: {
                  contains: normalizedQuery,
                  mode: 'insensitive',
                },
              },
              {
                name: {
                  contains: normalizedQuery,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    },
    orderBy: {
      username: 'asc',
    },
    take: 50,
  });

  return users.map((user) => toDirectoryUser(user, { addedContactIds }));
}

export async function addStoredContact(viewerUserId: string, targetUserId: string) {
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!targetUser) {
    return null;
  }

  await prisma.contact.upsert({
    where: {
      ownerId_contactId: {
        ownerId: viewerUserId,
        contactId: targetUserId,
      },
    },
    update: {},
    create: {
      ownerId: viewerUserId,
      contactId: targetUserId,
    },
  });

  return toDirectoryUser(targetUser, {
    addedContactIds: new Set([targetUserId]),
  });
}

export async function hasStoredContact(ownerId: string, targetUserId: string) {
  const contact = await prisma.contact.findUnique({
    where: {
      ownerId_contactId: {
        ownerId,
        contactId: targetUserId,
      },
    },
    select: { ownerId: true },
  });

  return Boolean(contact);
}

export async function getStoredChatMessages(chatId: string) {
  const messages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: 'asc' },
  });

  return messages.map((message) => ({
    id: message.id,
    chatId: message.chatId,
    text: message.text,
    senderId: message.senderId,
    senderName: message.senderName,
    createdAt: message.createdAt.toISOString(),
  }));
}

export async function createStoredMessage(message: StoredChatMessage) {
  const createdMessage = await prisma.message.create({
    data: {
      id: message.id,
      chatId: message.chatId,
      text: message.text,
      senderId: message.senderId,
      senderName: message.senderName,
      createdAt: new Date(message.createdAt),
    },
  });

  return {
    id: createdMessage.id,
    chatId: createdMessage.chatId,
    text: createdMessage.text,
    senderId: createdMessage.senderId,
    senderName: createdMessage.senderName,
    createdAt: createdMessage.createdAt.toISOString(),
  };
}

export async function persistCallRecord(call: PersistedCallInput) {
  await prisma.call.upsert({
    where: { id: call.id },
    update: {
      fromUserName: call.fromUserName,
      toUserName: call.toUserName,
      mode: call.mode as CallMode,
      status: call.status as CallStatus,
    },
    create: {
      id: call.id,
      fromUserId: call.fromUserId,
      fromUserName: call.fromUserName,
      toUserId: call.toUserId,
      toUserName: call.toUserName,
      mode: call.mode as CallMode,
      status: call.status as CallStatus,
      createdAt: new Date(call.createdAt),
    },
  });
}

export async function updateStoredCallStatus(
  callId: string,
  status: 'active' | 'rejected' | 'ended' | 'missed'
) {
  const data: {
    status: CallStatus;
    answeredAt?: Date;
    endedAt?: Date;
  } = {
    status: status as CallStatus,
  };

  if (status === 'active') {
    data.answeredAt = new Date();
  }

  if (status === 'rejected' || status === 'ended' || status === 'missed') {
    data.endedAt = new Date();
  }

  await prisma.call.update({
    where: { id: callId },
    data,
  });
}

export async function listStoredCallsForUser(userId: string) {
  const calls = await prisma.call.findMany({
    where: {
      OR: [{ fromUserId: userId }, { toUserId: userId }],
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return calls.map((call) => ({
    id: call.id,
    fromUserId: call.fromUserId,
    fromUserName: call.fromUserName,
    toUserId: call.toUserId,
    toUserName: call.toUserName,
    mode: call.mode as 'voice' | 'video',
    status: call.status as 'ringing' | 'active' | 'rejected' | 'ended' | 'missed',
    createdAt: call.createdAt.toISOString(),
    answeredAt: call.answeredAt?.toISOString(),
    endedAt: call.endedAt?.toISOString(),
  }));
}
