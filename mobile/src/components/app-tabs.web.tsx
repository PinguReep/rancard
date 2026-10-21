/**
 * Onglets pour le web (et Android tant que les onglets natifs n'y sont pas
 * activés) : barre JS d'Expo Router avec icônes Lucide.
 */

import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { Icone, type NomIcone } from '@/components/ui/icone';
import { usePermissions } from '@/state/session';
import { useTheme } from '@/theme/tokens';

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
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tabs.Screen name="planning" options={{ title: 'Planning', tabBarIcon: icone('planning') }} />
      <Tabs.Screen name="clients" options={{ title: 'Clients', tabBarIcon: icone('clients') }} />
      <Tabs.Screen name="appels" options={{ title: 'Appels', tabBarIcon: icone('appels'), href: p.appels ? undefined : null }} />
      <Tabs.Screen name="activite" options={{ title: 'Activité', tabBarIcon: icone('activite'), href: p.activite ? undefined : null }} />
    </Tabs>
  );
}
