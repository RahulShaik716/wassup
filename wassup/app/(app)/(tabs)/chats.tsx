import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/src/components/common/Avatar';
import { useSession } from '@/src/features/auth/session-context';
import { normalizePublicUser } from '@/src/features/auth/user-profile';
import { useCall } from '@/src/features/call/call-context';
import { socket } from '@/src/lib/socket';
import { palette, spacing } from '@/src/theme';
import type { PublicUser } from '@/src/types/user';

type DirectoryUser = PublicUser & {
  isOnline: boolean;
  isAdded: boolean;
};

type ContactsListResponse = {
  ok: boolean;
  contacts?: DirectoryUser[];
  error?: string;
};

type DirectorySearchResponse = {
  ok: boolean;
  users?: DirectoryUser[];
  error?: string;
};

type AddContactResponse = {
  ok: boolean;
  contact?: DirectoryUser;
  error?: string;
};

type PresenceUpdatePayload = {
  user: PublicUser;
  isOnline: boolean;
};

function normalizeDirectoryUsers(users: DirectoryUser[]) {
  return users.map(({ isAdded, isOnline, ...user }) => ({
    ...normalizePublicUser(user),
    isAdded,
    isOnline,
  }));
}

function sortUsers(users: DirectoryUser[]) {
  return [...users].sort((left, right) => left.username.localeCompare(right.username));
}

export default function ChatsScreen() {
  const { currentCall } = useCall();
  const { user } = useSession();
  const [connectionLabel, setConnectionLabel] = useState(socket.connected ? 'Online' : 'Connecting');
  const [contacts, setContacts] = useState<DirectoryUser[]>([]);
  const [searchResults, setSearchResults] = useState<DirectoryUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const searchQueryRef = useRef('');

  const trimmedQuery = searchQuery.trim();
  const isShowingSearch = trimmedQuery.length > 0;

  const listData = useMemo(() => {
    return isShowingSearch ? searchResults : contacts;
  }, [contacts, isShowingSearch, searchResults]);

  function openChat(targetUser: Pick<DirectoryUser, 'id' | 'username'>) {
    router.push({
      pathname: '/chat/[chatId]',
      params: {
        chatId: targetUser.id,
        name: targetUser.username,
        username: targetUser.username,
      },
    });
  }

  function syncContacts() {
    socket.emit('contacts:list', (response: ContactsListResponse) => {
      if (!response?.ok || !response.contacts) {
        return;
      }

      setContacts(sortUsers(normalizeDirectoryUsers(response.contacts)));
    });
  }

  function searchDirectory(query: string) {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    socket.emit(
      'directory:search',
      { query: normalizedQuery },
      (response: DirectorySearchResponse) => {
        setIsSearching(false);

        if (!response?.ok || !response.users) {
          setSearchResults([]);
          return;
        }

        setSearchResults(sortUsers(normalizeDirectoryUsers(response.users)));
      }
    );
  }

  function handleAddContact(targetUser: DirectoryUser) {
    socket.emit(
      'contacts:add',
      { targetUserId: targetUser.id },
      (response: AddContactResponse) => {
        if (!response?.ok) {
          Alert.alert('Unable to add contact', response?.error ?? 'Please try again.');
          return;
        }

        syncContacts();
        searchDirectory(searchQueryRef.current);
      }
    );
  }

  useEffect(() => {
    searchQueryRef.current = trimmedQuery;
  }, [trimmedQuery]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const currentUser = user;

    function handleConnect() {
      setConnectionLabel('Online');
      socket.emit('user:join', {
        userId: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        avatarUrl: currentUser.avatarUrl,
        username: currentUser.username,
      });
      syncContacts();

      if (searchQueryRef.current) {
        searchDirectory(searchQueryRef.current);
      }
    }

    function handleDisconnect() {
      setConnectionLabel('Offline');
    }

    function handlePresenceUpdate(_payload: PresenceUpdatePayload) {
      syncContacts();

      if (searchQueryRef.current) {
        searchDirectory(searchQueryRef.current);
      }
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('presence:update', handlePresenceUpdate);

    if (socket.connected) {
      handleConnect();
    } else {
      setConnectionLabel('Connecting...');
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('presence:update', handlePresenceUpdate);
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (!trimmedQuery) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timeout = setTimeout(() => {
      if (!socket.connected) {
        setConnectionLabel('Connecting...');
        socket.connect();
        return;
      }

      searchDirectory(trimmedQuery);
    }, 180);

    return () => {
      clearTimeout(timeout);
    };
  }, [trimmedQuery, user]);

  function renderEmptyState() {
    if (isShowingSearch) {
      return (
        <View
          style={{
            padding: spacing.lg,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.surface,
          }}>
          <Text
            style={{
              color: palette.text,
              fontSize: 18,
              fontWeight: '700',
              marginBottom: spacing.sm,
            }}>
            {isSearching ? 'Searching...' : 'No matching users'}
          </Text>
          <Text style={{ color: palette.mutedText, lineHeight: 22 }}>
            {isSearching
              ? 'Looking up usernames in your current app directory.'
              : 'Try another username or ask that person to open Wassup once.'}
          </Text>
        </View>
      );
    }

    return (
      <View
        style={{
          padding: spacing.lg,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.surface,
        }}>
        <Text
          style={{
            color: palette.text,
            fontSize: 18,
            fontWeight: '700',
            marginBottom: spacing.sm,
          }}>
          No contacts yet
        </Text>
        <Text style={{ color: palette.mutedText, lineHeight: 22 }}>
          Search for a username, add that person to your contacts, and then start chatting.
        </Text>
      </View>
    );
  }

  function renderRow(item: DirectoryUser) {
    const canChat = !isShowingSearch || item.isAdded;
    const actionLabel = canChat ? 'Chat' : 'Add';
    const subtitle = isShowingSearch
      ? item.isAdded
        ? item.isOnline
          ? 'Already added · Online'
          : 'Already added · Offline'
        : item.isOnline
          ? 'Available to add'
          : 'Offline but available to add'
      : item.isOnline
        ? 'Online now'
        : 'Offline';

    return (
      <Pressable
        disabled={!canChat}
        onPress={() => openChat(item)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.surface,
          opacity: canChat ? 1 : 0.96,
        }}>
        <Avatar name={item.username} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: palette.text, fontSize: 17, fontWeight: '700' }}>
            @{item.username}
          </Text>
          <Text style={{ color: palette.mutedText, marginTop: 4 }}>{subtitle}</Text>
        </View>
        <Pressable
          disabled={item.isAdded && !canChat}
          onPress={() => {
            if (canChat) {
              openChat(item);
              return;
            }

            handleAddContact(item);
          }}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: canChat ? palette.accentMuted : palette.accentDark,
          }}>
          <Text
            style={{
              color: canChat ? palette.accentDark : palette.surface,
              fontSize: 12,
              fontWeight: '700',
            }}>
            {actionLabel}
          </Text>
        </Pressable>
      </Pressable>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: palette.background }}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        data={listData}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={renderEmptyState()}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md, gap: spacing.md }}>
            <View
              style={{
                padding: spacing.lg,
                borderRadius: 28,
                borderWidth: 1,
                borderColor: palette.border,
                backgroundColor: palette.surface,
              }}>
              <Text style={{ color: palette.mutedText, fontSize: 12, fontWeight: '700' }}>
                CONTACTS
              </Text>
              <Text
                style={{
                  color: palette.text,
                  fontSize: 30,
                  fontWeight: '800',
                  marginTop: spacing.xs,
                }}>
                @{user?.username}
              </Text>
              <Text style={{ color: palette.mutedText, marginTop: spacing.sm, lineHeight: 22 }}>
                Find people by username, add them to your contacts, and chat only after they are added.
              </Text>
            </View>

            <View
              style={{
                borderRadius: 20,
                borderWidth: 1,
                borderColor: palette.border,
                backgroundColor: palette.surface,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}>
              <TextInput
                autoCapitalize="none"
                onChangeText={setSearchQuery}
                placeholder="Find people by username"
                placeholderTextColor={palette.mutedText}
                style={{
                  color: palette.text,
                  minHeight: 42,
                }}
                value={searchQuery}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View
                style={{
                  flex: 1,
                  padding: spacing.md,
                  borderRadius: 18,
                  backgroundColor: palette.surface,
                  borderWidth: 1,
                  borderColor: palette.border,
                }}>
                <Text style={{ color: palette.mutedText, fontSize: 12, fontWeight: '700' }}>
                  STATUS
                </Text>
                <Text style={{ color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 4 }}>
                  {connectionLabel}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  padding: spacing.md,
                  borderRadius: 18,
                  backgroundColor: palette.surface,
                  borderWidth: 1,
                  borderColor: palette.border,
                }}>
                <Text style={{ color: palette.mutedText, fontSize: 12, fontWeight: '700' }}>
                  CONTACTS
                </Text>
                <Text style={{ color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 4 }}>
                  {contacts.length}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  padding: spacing.md,
                  borderRadius: 18,
                  backgroundColor: palette.surface,
                  borderWidth: 1,
                  borderColor: palette.border,
                }}>
                <Text style={{ color: palette.mutedText, fontSize: 12, fontWeight: '700' }}>
                  ACTIVE CALL
                </Text>
                <Text style={{ color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 4 }}>
                  {currentCall ? 'In progress' : 'Ready'}
                </Text>
              </View>
            </View>

            <Text style={{ color: palette.mutedText, fontSize: 12, fontWeight: '700' }}>
              {isShowingSearch ? 'SEARCH RESULTS' : 'YOUR CONTACTS'}
            </Text>
          </View>
        }
        renderItem={({ item }) => renderRow(item)}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
