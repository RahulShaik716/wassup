  import { Tabs } from 'expo-router';

  export default function TabsLayout() {
    return (
      <Tabs screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="chats" options={{ title: 'Chats' }} />
        <Tabs.Screen name="calls" options={{ title: 'Calls' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      </Tabs>
    );
  }