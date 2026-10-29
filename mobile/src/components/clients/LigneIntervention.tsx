/**
 * Ligne d'une intervention dans la fiche client : prestation, quand, plaque
 * (et modèle si le client a plusieurs véhicules), kilométrage relevé au
 * dépôt une fois l’intervention close, statut, montant si autorisé.
 */

import { differenceInCalendarDays, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { View } from 'react-native';

import { Ligne } from '@/components/ui/carte';
import { Icone } from '@/components/ui/icone';
import { PastilleBlocage, PastilleStatut } from '@/components/ui/pastille';
import { Secondaire, Texte } from '@/components/ui/texte';
import { BLOCAGES, STATUTS, estBloquee } from '@/domain/statuts';
import type { Intervention, Vehicule } from '@/domain/types';
import { euros, heure, kilometrage } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

import { libelleVehicule } from './outils';

type Props = {
  intervention: Intervention;
  /** Véhicule de l’intervention : sa plaque, et son modèle si `avecModele` */
  vehicule?: Vehicule;
  /** Le client a plusieurs véhicules : le modèle s’ajoute à la plaque */
  avecModele?: boolean;
  voirPrix: boolean;
  derniere: boolean;
  onPress: () => void;
};

/** « aujourd’hui 11:00 », « demain 08:30 », « hier 16:05 », « mer. 29 avr. 09:00 », « mar. 14 oct. 2025 09:00 ». */
function quandLigne(iso: string, maintenant: Date): string {
  const d = new Date(iso);
  const ecart = differenceInCalendarDays(d, maintenant);
  if (ecart === 0) return `aujourd’hui ${heure(iso)}`;
  if (ecart === 1) return `demain ${heure(iso)}`;
  if (ecart === -1) return `hier ${heure(iso)}`;
  const jour = format(d, d.getFullYear() === maintenant.getFullYear() ? 'EEE d MMM' : 'EEE d MMM yyyy', { locale: fr });
  return `${jour} ${heure(iso)}`;
}

export function LigneIntervention({ intervention: i, vehicule, avecModele, voirPrix, derniere, onPress }: Props) {
  const t = useTheme();
  const quand = quandLigne(i.debut, new Date());
  const close = i.statut === 'livre' || i.statut === 'annule';
  const km = close && i.kmDepot != null ? kilometrage(i.kmDepot) : null;
  const bloquee = i.blocage && estBloquee(i) ? i.blocage : null;
  const voiture = vehicule ? [avecModele ? libelleVehicule(vehicule) : null, vehicule.plaque].filter(Boolean).join(' · ') : null;
  const detail = [quand, voiture, km].filter(Boolean).join(' · ');

  const label = [
    i.prestation,
    quand,
    vehicule ? `${avecModele ? `${libelleVehicule(vehicule)}, ` : ''}plaque ${vehicule.plaque}` : null,
    km ? `${km} au dépôt` : null,
    STATUTS[i.statut].label,
    bloquee ? BLOCAGES[bloquee].label : null,
    voirPrix && i.montantEstime != null ? euros(i.montantEstime) : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Ligne onPress={onPress} derniere={derniere} accessibilityLabel={label}>
      <View className="flex-1 gap-1.5">
        <Texte numberOfLines={1} className="font-semibold">
          {i.prestation}
        </Texte>
        <Secondaire numberOfLines={2}>{detail}</Secondaire>
        <View className="flex-row flex-wrap items-center gap-1.5">
          <PastilleStatut statut={i.statut} court />
          {bloquee ? <PastilleBlocage blocage={bloquee} /> : null}
        </View>
      </View>
      {voirPrix && i.montantEstime != null ? <Texte className="text-[15px] font-semibold">{euros(i.montantEstime)}</Texte> : null}
      <Icone nom="chevron.droite" taille={16} couleur={t.faint} />
    </Ligne>
  );
}
