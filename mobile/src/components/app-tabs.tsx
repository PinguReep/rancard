/**
 * Onglets natifs iOS (Liquid Glass sur iOS 26) : Planning, Chercher,
 * Appels. Appels est masqué sans la permission (sans le réceptionniste, il
 * reste visible et montre la fonction grisée) ;
 * l'activité du garage s'ouvre depuis le profil.
 *
 * Planning en grille, téléphone couché : la barre se masque, la semaine
 * prend toute la hauteur (lib/orientation.ts).
 */

import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { sfSymbol } from '@/components/ui/icone';
import { useOrientation } from '@/lib/orientation';
import { usePermissions } from '@/state/session';
import { useTheme } from '@/theme/tokens';

export default function AppTabs() {
  const t = useTheme();
  const p = usePermissions();
  const paysageGrille = useOrientation((s) => s.paysageGrille);

  return (
    <NativeTabs
      hidden={paysageGrille}
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
      {/* Sans le réceptionniste, l’onglet reste visible : il montre la fonction grisée. */}
      <NativeTabs.Trigger name="appels" hidden={!p.appels}>
        <NativeTabs.Trigger.Label>Appels</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={sfSymbol('appels') as never} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
