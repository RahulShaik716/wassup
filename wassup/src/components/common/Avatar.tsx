import { Text, View } from 'react-native';

import { palette } from '@/src/theme';

type AvatarProps = {
  name?: string | null;
  size?: number;
};

export function Avatar({ name, size = 48 }: AvatarProps) {
  const safeName = (name ?? '').trim();

  const initials = safeName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.accentMuted,
        borderWidth: 1,
        borderColor: palette.border,
      }}>
      <Text
        style={{
          color: palette.accentDark,
          fontSize: Math.max(14, size / 2.7),
          fontWeight: '700',
        }}>
        {initials || '?'}
      </Text>
    </View>
  );
}
