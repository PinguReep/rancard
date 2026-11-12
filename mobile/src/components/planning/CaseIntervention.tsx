/**
 * Case d’une intervention dans la grille horaire du planning (et l’aperçu
 * de l’éditeur de vue). Elle montre les champs choisis par la vue, dans
 * leur ordre, le premier en gras, et s’adapte à sa place : autant de lignes
 * que la hauteur en laisse, les champs restants réunis par « · » sur la
 * dernière, chaque ligne tronquée proprement quand la case est étroite.
 *
 * Couleur : par état (mêmes tons que les cartes de la liste) ou par
 * mécanicien (sa couleur d’avatar). Prioritaire (point rouge) et bloquée
 * (pause ambrée) restent repérables quelle que soit la couleur choisie.
 * Jamais de montant.
 *
 * Appui = fiche ; appui long = actions rapides (la même feuille que la liste).
 */

import { Pressable, Text, View } from 'react-native';

import { Icone, impulsion } from '@/components/ui';
import { BLOCAGES, estBloquee } from '@/domain/statuts';
import type { Blocage, Client, Intervention, Membre, Statut } from '@/domain/types';
import { duree, heure, nomClient } from '@/lib/format';
import { fondAvatar, useTheme, type Palette } from '@/theme/tokens';

import { etatCarte } from './CarteIntervention';
import { lignesQuiTiennent, repartirLignes } from './horaire';
import type { ChampBloc, CouleurCase } from './vues';

type Props = {
  intervention: Intervention;
  client?: Client;
  vehicule?: { marque: string; modele: string; plaque: string };
  mecanicien?: Membre | null;
  champs: ChampBloc[];
  couleur: CouleurCase;
  /** Hauteur de la case (zoom au repos) : décide du nombre de lignes */
  hauteur: number;
  /** Case étroite (chevauchement) : marges resserrées, la place va au texte */
  etroite?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

type Ton = 'accent' | 'warn' | 'ok' | 'muted';

const SOFT: Record<Ton, keyof Palette> = {
  accent: 'accentSoft',
  warn: 'warnSoft',
  ok: 'okSoft',
  muted: 'mutedSoft',
};

function tonEtat(i: Intervention): Ton {
  if (estBloquee(i) || i.statut === 'a_valider') return 'warn';
  if (i.statut === 'termine') return 'ok';
  if (i.statut === 'planifie' || i.statut === 'livre' || i.statut === 'annule') return 'muted';
  return 'accent';
}

/** Mot d’état de la carte : le blocage s’il y en a un, sinon « En cours », « Prêt »… */
export function motEtat(i: Intervention, t: Palette): string {
  return estBloquee(i) && i.blocage ? BLOCAGES[i.blocage].label : etatCarte(i.statut, t).mot;
}

const ETAPE_SUIVANTE: Record<Statut, string> = {
  a_valider: 'À confirmer',
  planifie: 'À recevoir',
  recu: 'À démarrer',
  en_cours: 'À terminer',
  termine: 'À livrer',
  livre: 'Livrée',
  annule: 'Annulée',
};

const ETAPE_BLOCAGE: Record<Blocage, string> = {
  attente_piece: 'Attend la pièce',
  attente_accord: 'Attend l’accord',
  rappeler_client: 'Client à rappeler',
  client_sur_place: 'Client sur place',
};

/**
 * Prochaine étape, dite comme un travail à faire (« À recevoir », « À démarrer ») :
 * dans une case, le libellé du bouton de la carte (« Reçu ») se lirait comme un état.
 * Une voiture bloquée dit ce qu’elle attend. La même pour tous, quelles que soient les permissions.
 */
function prochaineEtape(i: Intervention): string {
  return estBloquee(i) && i.blocage ? ETAPE_BLOCAGE[i.blocage] : ETAPE_SUIVANTE[i.statut];
}

/** Texte de chaque champ pour cette intervention (vide : le champ n’a rien à dire). */
export function useTextesChamps(
  i: Intervention,
  champs: ChampBloc[],
  o: {
    client?: Client;
    vehicule?: { marque: string; modele: string; plaque: string };
    mecanicien?: Membre | null;
  },
): string[] {
  const t = useTheme();
  const fin = new Date(new Date(i.debut).getTime() + (i.dureeMin || 0) * 60000).toISOString();
  return champs.map((c) => {
    switch (c) {
      case 'client':
        return nomClient(o.client);
      case 'vehicule':
        return o.vehicule ? `${o.vehicule.marque} ${o.vehicule.modele}` : 'Véhicule inconnu';
      case 'plaque':
        return o.vehicule?.plaque ?? '';
      case 'prestation':
        return i.prestation;
      case 'etape':
        return prochaineEtape(i);
      case 'etat':
        return motEtat(i, t);
      case 'mecanicien':
        return o.mecanicien ? o.mecanicien.prenom : 'À attribuer';
      case 'horaire':
        return `${heure(i.debut)} – ${heure(fin)}`;
      case 'duree':
        return i.dureeMin > 0 ? duree(i.dureeMin) : '';
      case 'memo':
        return i.memo?.trim() ?? '';
    }
  });
}

export function CaseIntervention({
  intervention: i,
  client,
  vehicule,
  mecanicien,
  champs,
  couleur,
  hauteur,
  etroite,
  onPress,
  onLongPress,
}: Props) {
  const t = useTheme();
  const textes = useTextesChamps(i, champs, {
    client,
    vehicule,
    mecanicien,
  });
  const lignes = repartirLignes(textes, lignesQuiTiennent(hauteur));
  const bloquee = estBloquee(i);
  const close = i.statut === 'livre' || i.statut === 'annule';

  let fond: string;
  let lisere: string;
  let bord: string;
  if (couleur === 'mecanicien') {
    const c = mecanicien ? fondAvatar(mecanicien.couleur) : t.faint;
    fond = mecanicien ? `${c}${t.scheme === 'dark' ? '38' : '1c'}` : t.surface2;
    lisere = c;
    bord = mecanicien ? `${c}55` : t.line;
  } else {
    const ton = tonEtat(i);
    fond = t[SOFT[ton]];
    lisere = t[ton];
    bord = `${t[ton]}${t.scheme === 'dark' ? '55' : '40'}`;
  }

  const label = [
    i.prioritaire ? 'Prioritaire' : null,
    ...textes,
    bloquee && !champs.includes('etat') ? motEtat(i, t) : null,
    `de ${heure(i.debut)}, ${duree(i.dureeMin || 0)}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={onLongPress ? 'Appui long pour les actions rapides' : undefined}
      onPress={
        onPress
          ? () => {
              impulsion('leger');
              onPress();
            }
          : undefined
      }
      onLongPress={
        onLongPress
          ? () => {
              impulsion('moyen');
              onLongPress();
            }
          : undefined
      }
      delayLongPress={350}
      style={{
        backgroundColor: fond,
        borderColor: bord,
        borderLeftColor: lisere,
        opacity: close ? 0.6 : 1,
      }}
      className={`flex-1 overflow-hidden rounded-lg border border-l-[3px] py-1 active:opacity-70 ${etroite ? 'px-1' : 'px-1.5'}`}>
      <View className="flex-row items-start gap-1">
        {i.prioritaire ? <View accessibilityLabel="Prioritaire" className="mt-[5px] h-1.5 w-1.5 rounded-full bg-danger dark:bg-danger-dark" /> : null}
        <View className="flex-1">
          {lignes.map((l, k) => (
            <Text
              key={k}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
              className={
                k === 0
                  ? 'text-[13px] font-semibold leading-[16px] text-ink dark:text-ink-dark'
                  : 'text-[12px] leading-[15px] text-muted dark:text-muted-dark'
              }>
              {l}
            </Text>
          ))}
        </View>
        {bloquee ? (
          <View className="mt-0.5">
            <Icone nom="pause" taille={10} couleur={t.warn} poids="bold" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
