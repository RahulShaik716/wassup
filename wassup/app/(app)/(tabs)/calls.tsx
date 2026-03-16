import { Text, View } from 'react-native';

  import { useCall } from '@/src/features/call/call-context';

  export default function CallsScreen() {
    const { currentCall } = useCall();

    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>Calls</Text>
        <Text>
          {currentCall
            ? `Current call: ${currentCall.mode} (${currentCall.status})`
            : 'No active call'}
        </Text>
      </View>
    );
  }