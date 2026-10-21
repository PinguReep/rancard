import { Stack } from 'expo-router';

import { useTheme } from '@/theme/tokens';

/** Pile modale du profil : index → équipe, réglages, compte. */
export default function ProfilLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerTintColor: t.accent,
        headerTitleStyle: { color: t.ink },
        headerStyle: { backgroundColor: t.bg },
        contentStyle: { backgroundColor: t.bg },
        headerShadowVisible: false,
      }}
    />
  );
}
