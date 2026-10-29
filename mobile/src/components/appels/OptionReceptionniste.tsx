/**
 * Onglet Appels quand la prestation « Réceptionniste IA » n'est pas dans
 * l'offre du garage : la fonction reste visible, grisée, avec la phrase
 * neutre de `domain/prestations.ts`. Ni prix, ni bouton, ni invitation à
 * l'activer (App Store 3.1.3(f)) : un aperçu grisé d'une carte d'appel dit
 * seulement ce que l'onglet montrerait.
 */

import { setHours, setMinutes, startOfDay, subDays } from 'date-fns';
import { View } from 'react-native';

import { Carte } from '@/components/ui/carte';
import { Icone } from '@/components/ui/icone';
import { Pastille } from '@/components/ui/pastille';
import { Etiquette, Secondaire, SousTitre } from '@/components/ui/texte';
import { LIBELLES_PRESTATION, NON_INCLUS } from '@/domain/prestations';
import type { Appel } from '@/domain/types';
import { useTheme } from '@/theme/tokens';

import { LigneAppel } from './LigneAppel';

/** Appel fictif, uniquement pour l'aperçu. Rien n'est enregistré. */
function appelExemple(): Appel {
  const hier = startOfDay(subDays(new Date(), 1));
  return {
    id: 'exemple',
    garageId: 'exemple',
    numero: '06 39 98 00 10',
    appelant: 'Camille Durand',
    debut: setMinutes(setHours(hier, 19), 42).toISOString(),
    dureeSec: 124,
    horsHoraires: true,
    enCours: false,
    issue: 'rdv_pris',
    resume:
      'Bruit de frein à l’avant depuis quelques jours. Le réceptionniste a proposé un contrôle des plaquettes jeudi à 9h00, accepté.',
  };
}

export function OptionReceptionniste() {
  const t = useTheme();
  return (
    <View className="px-4">
      <Carte className="p-5" accessible accessibilityLabel={`${LIBELLES_PRESTATION.receptionniste}. ${NON_INCLUS}`}>
        <View className="mb-4 h-12 w-12 items-center justify-center rounded-2xl bg-surface2 dark:bg-surface2-dark">
          <Icone nom="cadenas" taille={22} couleur={t.muted} />
        </View>
        <SousTitre ton="muted">{LIBELLES_PRESTATION.receptionniste}</SousTitre>
        <Secondaire className="mt-1">Les appels traités par le réceptionniste téléphonique s’affichent ici.</Secondaire>
        <Secondaire className="mt-4 font-medium">{NON_INCLUS}</Secondaire>
      </Carte>

      <View className="mb-2 ml-1 mt-8 flex-row items-center gap-2 opacity-60">
        <Etiquette>Aperçu d’un appel</Etiquette>
        <Pastille label="Exemple" ton="muted" />
      </View>
      <View
        className="opacity-40"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <LigneAppel appel={appelExemple()} />
      </View>
    </View>
  );
}
