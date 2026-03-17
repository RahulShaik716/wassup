import { SafeAreaView, Text, View } from 'react-native';

import { useCall } from '@/src/features/call/call-context';
import { palette, spacing } from '@/src/theme';

export default function CallsScreen() {
  const { currentCall } = useCall();

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
            CALL CENTER
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
            Call history is the next persistence feature. For now this screen tracks the active call
            state.
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
            CURRENT STATE
          </Text>
          <Text style={{ color: palette.text, fontSize: 20, fontWeight: '700', marginTop: spacing.sm }}>
            {currentCall ? `${currentCall.mode} call` : 'No live call'}
          </Text>
          <Text style={{ color: palette.mutedText, marginTop: spacing.xs }}>
            {currentCall ? `Status: ${currentCall.status}` : 'Start a call from any chat thread.'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
