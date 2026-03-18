import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '@/src/theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.accentDark,
        tabBarInactiveTintColor: palette.mutedText,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
          height: 68 + insets.bottom,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 12),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        tabBarIcon: ({ color, focused, size }) => {
          const iconName =
            route.name === 'chats'
              ? focused
                ? 'chatbubbles'
                : 'chatbubbles-outline'
              : route.name === 'calls'
                ? focused
                  ? 'call'
                  : 'call-outline'
                : focused
                  ? 'settings'
                  : 'settings-outline';

          return <Ionicons color={color} name={iconName} size={size} />;
        },
      })}>
      <Tabs.Screen name="chats" options={{ title: 'Chats' }} />
      <Tabs.Screen name="calls" options={{ title: 'Calls' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
