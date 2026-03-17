import { Pressable, SafeAreaView, Text, View } from 'react-native';

import { Avatar } from '@/src/components/common/Avatar';
import { useSession } from '@/src/features/auth/session-context';
import { palette, spacing } from '@/src/theme';

export default function SettingsScreen() {
  const { signOut, user } = useSession();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
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
            ACCOUNT
          </Text>
          <Text
            style={{
              color: palette.text,
              fontSize: 30,
              fontWeight: '800',
              marginTop: spacing.xs,
            }}>
            Settings
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
          <Avatar name={user?.name || 'You'} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.text, fontSize: 20, fontWeight: '700' }}>
              {user?.name}
            </Text>
            <Text style={{ color: palette.mutedText, marginTop: 4 }}>
              {user?.email || 'Guest account'}
            </Text>
            <Text style={{ color: palette.mutedText, marginTop: 4, fontSize: 12 }}>
              Provider: {user?.provider}
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
            Storage plan
          </Text>
          <Text style={{ color: palette.mutedText, lineHeight: 22, marginTop: spacing.sm }}>
            Keep the mobile UI separate from persistence. The next server step is storing messages
            and call logs in a hosted database instead of memory.
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
