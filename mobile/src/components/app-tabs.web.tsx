/**
 * Onglets pour le web (et Android tant que les onglets natifs n'y sont pas
 * activés) : barre JS d'Expo Router, flottante et arrondie comme la barre
 * iOS 26. Planning, Chercher, Appels.
 */

import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { Icone, type NomIcone } from '@/components/ui/icone';
import { usePermissions } from '@/state/session';
import { halo, useTheme } from '@/theme/tokens';

const icone = (nom: NomIcone) =>
  function IconeOnglet({ color }: { color: ColorValue }) {
    return <Icone nom={nom} taille={22} couleur={String(color)} />;
  };

export default function AppTabs() {
  const t = useTheme();
  const p = usePermissions();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: {
          position: 'absolute',
          left: 24,
          right: 24,
          bottom: 22,
          height: 70,
          paddingTop: 8,
          paddingBottom: 10,
          borderRadius: 32,
          borderTopWidth: 1,
          borderWidth: 1,
          borderColor: t.line,
          borderTopColor: t.line,
          backgroundColor: t.scheme === 'dark' ? 'rgba(23, 28, 37, 0.88)' : 'rgba(255, 255, 255, 0.92)',
          ...(t.scheme === 'dark' ? halo('#000000', 20, 0.5) : {}),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
      }}>
      <Tabs.Screen name="planning" options={{ title: 'Planning', tabBarIcon: icone('planning') }} />
      <Tabs.Screen name="clients" options={{ title: 'Chercher', tabBarIcon: icone('recherche') }} />
      {/* Sans le réceptionniste, l’onglet reste visible : il montre la fonction grisée. */}
      <Tabs.Screen name="appels" options={{ title: 'Appels', tabBarIcon: icone('appels'), href: p.appels ? undefined : null }} />
    </Tabs>
  );
}
