/**
 * Onglets natifs iOS (Liquid Glass sur iOS 26) : Planning, Chercher,
 * Appels. Appels est masqué sans la permission ou sans le réceptionniste ;
 * l'activité du garage s'ouvre depuis le profil.
 */

import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { sfSymbol } from '@/components/ui/icone';
import { useDonnees, usePermissions } from '@/state/session';
import { useTheme } from '@/theme/tokens';

export default function AppTabs() {
  const t = useTheme();
  const p = usePermissions();
  const receptionniste = useDonnees((s) => s.garage.options.receptionniste);

  return (
    <NativeTabs
      backgroundColor={t.bg}
      indicatorColor={t.surface2}
      labelStyle={{ selected: { color: t.accent } }}
      iconColor={{ selected: t.accent, default: t.muted }}>
      <NativeTabs.Trigger name="planning">
        <NativeTabs.Trigger.Label>Planning</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={sfSymbol('planning') as never} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="clients">
        <NativeTabs.Trigger.Label>Chercher</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={sfSymbol('recherche') as never} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="appels" hidden={!p.appels || !receptionniste}>
        <NativeTabs.Trigger.Label>Appels</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={sfSymbol('appels') as never} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
