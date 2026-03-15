 import { Text, View } from 'react-native';

  export default function SettingsScreen() {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>Settings</Text>
        <Text>Placeholder settings screen</Text>
      </View>
    );
  }
