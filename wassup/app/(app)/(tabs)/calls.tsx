import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCall } from '@/src/features/call/call-context';
import { palette, spacing } from '@/src/theme';

export default function CallsScreen() {
  const { currentCall } = useCall();

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
            CALLS
          </Text>
          <Text
            style={{
              color: palette.text,
              fontSize: 30,
              fontWeight: '800',
              marginTop: spacing.xs,
            }}>
            Calls
          </Text>
          <Text style={{ color: palette.mutedText, marginTop: spacing.sm, lineHeight: 22 }}>
            Keep track of the calls happening right now.
          </Text>
        </View>

        <View
          style={{
            padding: spacing.lg,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: currentCall ? palette.accentMuted : palette.surface,
          }}>
          <Text style={{ color: palette.mutedText, fontSize: 12, fontWeight: '700' }}>
            STATUS
          </Text>
          <Text style={{ color: palette.text, fontSize: 20, fontWeight: '700', marginTop: spacing.sm }}>
            {currentCall ? `${currentCall.mode === 'video' ? 'Video' : 'Voice'} call live` : 'No active call'}
          </Text>
          <Text style={{ color: palette.mutedText, marginTop: spacing.xs }}>
            {currentCall ? 'Open the chat to manage the current call.' : 'Start a call from any chat.'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
