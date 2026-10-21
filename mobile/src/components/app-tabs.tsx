/**
 * Onglets natifs iOS (Liquid Glass sur iOS 26). Les onglets Appels et
 * Activité sont masqués selon les permissions du membre.
 */

import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { sfSymbol } from '@/components/ui/icone';
import { usePermissions } from '@/state/session';
import { useTheme } from '@/theme/tokens';

export default function AppTabs() {
  const t = useTheme();
  const p = usePermissions();

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
        <NativeTabs.Trigger.Label>Clients</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={sfSymbol('clients') as never} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="appels" hidden={!p.appels}>
        <NativeTabs.Trigger.Label>Appels</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={sfSymbol('appels') as never} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="activite" hidden={!p.activite}>
        <NativeTabs.Trigger.Label>Activité</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={sfSymbol('activite') as never} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
