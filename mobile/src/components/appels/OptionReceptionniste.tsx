/**
 * Onglet Appels quand le réceptionniste n'est pas activé pour ce garage :
 * une explication calme de ce que fait l'option, sans bouton d'achat, et un
 * aperçu grisé d'une carte d'appel pour se projeter.
 */

import { setHours, setMinutes, startOfDay, subDays } from 'date-fns';
import { View } from 'react-native';

import { Carte } from '@/components/ui/carte';
import { Icone, type NomIcone } from '@/components/ui/icone';
import { Pastille } from '@/components/ui/pastille';
import { Etiquette, Legende, Secondaire, SousTitre, Texte } from '@/components/ui/texte';
import type { Appel } from '@/domain/types';
import { useTheme } from '@/theme/tokens';

import { LigneAppel } from './LigneAppel';

function Point({ icone, titre, texte }: { icone: NomIcone; titre: string; texte: string }) {
  const t = useTheme();
  return (
    <View className="flex-row gap-3">
      <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-xl bg-surface2 dark:bg-surface2-dark">
        <Icone nom={icone} taille={18} couleur={t.ink} />
      </View>
      <View className="flex-1">
        <Texte className="font-semibold">{titre}</Texte>
        <Secondaire className="mt-0.5">{texte}</Secondaire>
      </View>
    </View>
  );
}

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
      <Carte className="p-5">
        <View className="mb-4 h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft dark:bg-accent-softdark">
          <Icone nom="appels" taille={22} couleur={t.accent} />
        </View>
        <SousTitre>Réceptionniste téléphonique</SousTitre>
        <Secondaire className="mt-1">Un assistant qui décroche pour le garage quand l’équipe a les mains prises.</Secondaire>

        <View className="mt-6 gap-5">
          <Point
            icone="horloge"
            titre="Répond aux appels, même hors horaires"
            texte={'Le soir, le week-end, pendant une intervention : personne ne tombe sur le répondeur.'}
          />
          <Point
            icone="planning"
            titre="Prend les rendez-vous et crée la fiche"
            texte="Client, véhicule, prestation et créneau arrivent prêts à valider dans le planning."
          />
          <Point icone="message" titre="Vous laisse un résumé" texte="Chaque appel se termine par un résumé lisible en dix secondes." />
        </View>

        <Legende className="mt-6">Option à activer avec Rencar. Aucun appel n’est traité pour l’instant.</Legende>
      </Carte>

      <View className="mb-2 ml-1 mt-8 flex-row items-center gap-2">
        <Etiquette>Aperçu d’un appel</Etiquette>
        <Pastille label="Exemple" ton="muted" />
      </View>
      <View
        className="opacity-50"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <LigneAppel appel={appelExemple()} />
      </View>
    </View>
  );
}
