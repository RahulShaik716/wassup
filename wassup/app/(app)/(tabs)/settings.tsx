import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/src/components/common/Avatar';
import { useSession } from '@/src/features/auth/session-context';
import { palette, spacing } from '@/src/theme';

export default function SettingsScreen() {
  const { signOut, user } = useSession();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ flex: 1, padding: spacing.lg, gap: spacing.md }}>
        <View
          style={{
            padding: spacing.lg,
            borderRadius: 28,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.surface,
          }}>
          <Text style={{ color: palette.mutedText, fontSize: 12, fontWeight: '700' }}>
            PROFILE
          </Text>
          <Text
            style={{
              color: palette.text,
              fontSize: 30,
              fontWeight: '800',
              marginTop: spacing.xs,
            }}>
            You
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.surface,
          }}>
          <Avatar name={user?.username || 'you'} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.text, fontSize: 20, fontWeight: '700' }}>
              @{user?.username}
            </Text>
            <Text style={{ color: palette.mutedText, marginTop: 4 }}>
              Your Wassup username
            </Text>
          </View>
        </View>

        <View
          style={{
            padding: spacing.lg,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.surface,
          }}>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '700' }}>
            Notifications
          </Text>
          <Text style={{ color: palette.mutedText, lineHeight: 22, marginTop: spacing.sm }}>
            This device receives private message alerts and incoming call notifications.
          </Text>
        </View>

        <View
          style={{
            padding: spacing.lg,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.surface,
          }}>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '700' }}>
            Privacy
          </Text>
          <Text style={{ color: palette.mutedText, lineHeight: 22, marginTop: spacing.sm }}>
            Contact presence is hidden, notifications stay generic on the lock screen, and chats open only for people you add.
          </Text>
        </View>

        <Pressable
          onPress={() => {
            void signOut();
          }}
          style={{
            minHeight: 56,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.text,
          }}>
          <Text style={{ color: palette.surface, fontSize: 16, fontWeight: '700' }}>Sign Out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
