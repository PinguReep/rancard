/**
 * Où en est la voiture : Reçu → En cours → Prêt → Livré. Deux formes :
 * la piste (quatre segments, sur les cartes du planning) et la frise
 * (quatre étapes nommées, en tête de fiche). L'étape en cours s'allume ;
 * bloquée, elle passe à l'ambre.
 */

import { Text, View } from 'react-native';

import type { Intervention, Statut } from '@/domain/types';
import { halo, useTheme } from '@/theme/tokens';

import { Icone } from './icone';

export const ETAPES = ['Reçu', 'En cours', 'Prêt', 'Livré'] as const;

/** Index de l'étape en cours (−1 : véhicule pas encore au garage). */
export function etapeDe(statut: Statut): number {
  switch (statut) {
    case 'recu':
      return 0;
    case 'en_cours':
      return 1;
    case 'termine':
      return 2;
    case 'livre':
      return 3;
    default:
      return -1;
  }
}

type Etat = 'fait' | 'ici' | 'avenir';

function couleurs(i: Pick<Intervention, 'statut' | 'blocage'>) {
  return { bloquee: i.blocage !== null && i.statut !== 'livre' && i.statut !== 'annule', pret: i.statut === 'termine' || i.statut === 'livre' };
}

/** Largeur de la piste compacte (carte qui porte un bouton de geste, v2c). */
export const LARGEUR_PISTE_COMPACTE = 72;

/**
 * Quatre segments fins ; l'étape en cours brille. `compacte` : largeur fixe
 * de 72 pt, pour laisser la place au mot d’état et au bouton de geste sur
 * la même ligne de la carte.
 */
export function PisteAvancement({ intervention: i, compacte }: { intervention: Pick<Intervention, 'statut' | 'blocage'>; compacte?: boolean }) {
  const t = useTheme();
  const ici = etapeDe(i.statut);
  const { bloquee, pret } = couleurs(i);
  const vive = bloquee ? t.warn : pret ? t.ok : t.accent;
  return (
    <View
      className={compacte ? 'flex-row gap-1' : 'flex-1 flex-row gap-1'}
      style={compacte ? { width: LARGEUR_PISTE_COMPACTE } : undefined}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {ETAPES.map((nom, k) => {
        const etat: Etat = k < ici ? 'fait' : k === ici ? 'ici' : 'avenir';
        const fond = etat === 'avenir' ? t.line : etat === 'fait' ? (pret ? t.ok : t.accentFond) : vive;
        return (
          <View
            key={nom}
            className="h-1 flex-1 rounded-full"
            style={[{ backgroundColor: fond, opacity: etat === 'fait' && !pret ? 0.6 : 1 }, etat === 'ici' && t.scheme === 'dark' ? halo(vive, 6, 0.9) : null]}
          />
        );
      })}
    </View>
  );
}

/** Frise nommée de la fiche intervention. */
export function Frise({ intervention: i }: { intervention: Pick<Intervention, 'statut' | 'blocage'> }) {
  const t = useTheme();
  const ici = etapeDe(i.statut);
  const { bloquee, pret } = couleurs(i);
  const vive = bloquee ? t.warn : pret ? t.ok : t.accent;
  const plein = pret ? t.ok : t.accentFond;
  const libelle = ici < 0 ? 'Véhicule pas encore reçu' : `Étape ${ici + 1} sur 4 : ${ETAPES[ici]}${bloquee ? ', bloquée' : ''}`;

  return (
    <View accessible accessibilityLabel={libelle} className="mt-6 px-3">
      {/* Rail entre le centre de la première et de la dernière pastille */}
      <View className="absolute left-[44px] right-[44px] top-[13px] h-[2px] rounded-full" style={{ backgroundColor: t.line }}>
        {ici > 0 ? (
          <View
            className="h-[2px] rounded-full"
            style={[{ backgroundColor: plein, width: `${(Math.min(ici, 3) / 3) * 100}%` }, t.scheme === 'dark' ? halo(plein, 6, 0.8) : null]}
          />
        ) : null}
      </View>
      <View className="flex-row justify-between">
        {ETAPES.map((nom, k) => {
          const etat: Etat = k < ici ? 'fait' : k === ici ? 'ici' : 'avenir';
          return (
            <View key={nom} className="w-[64px] items-center gap-2">
              <View
                className="h-7 w-7 items-center justify-center rounded-full border-2"
                style={[
                  {
                    borderColor: etat === 'avenir' ? t.line : etat === 'fait' ? plein : vive,
                    backgroundColor: etat === 'fait' ? plein : t.bg,
                  },
                  etat === 'ici' && t.scheme === 'dark' ? halo(vive, 12, 0.9) : null,
                ]}>
                {etat === 'fait' ? <Icone nom="valider" taille={13} couleur={t.blanc} poids="bold" /> : null}
                {etat === 'ici' ? <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: vive }} /> : null}
              </View>
              <Text
                maxFontSizeMultiplier={1.3}
                className="text-[12.5px] font-semibold"
                style={{ color: etat === 'ici' ? t.ink : etat === 'fait' ? t.muted : t.faint }}>
                {nom}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
