/**
 * Barre d'action en bas de la fiche, sous le pouce : Photo, Bloquer (ou
 * Préciser sur une fiche bloquée) et le geste suivant en grand. Les gestes
 * viennent de `actionsPossibles` avec le contexte du membre connecté
 * (`contexteActions`), jamais inventés ici : le mécanicien n’a ni « Livré
 * au client » ni « Annuler » (D3) ; sur une voiture prête, la barre lui dit
 * que la remise se fait au comptoir.
 *
 * Sur une fiche reçue ou en cours et bloquée, le grand bouton est la levée
 * (« Pièce reçue », « Client rappelé », ou « Accord reçu » qui ouvre
 * toujours la feuille Accord). « Bloquer » ouvre la feuille Bloquer (2
 * appuis jusqu’à la pose) ; « Préciser » la rouvre sur le blocage en cours
 * (pièce, date, levée).
 *
 * Double appui : une seule garde pour toute l’app (`components/ui/garde`),
 * armée par le passage de statut après chaque geste. Le grand bouton
 * montre déjà son nouveau libellé mais reste inerte et estompé ce temps-là.
 * Un libellé qui change sans appui (geste d’un collègue reçu du serveur)
 * réarme la garde.
 */

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icone, Texte, armerGarde, impulsion, useGardeActive } from '@/components/ui';
import { Verre } from '@/components/ui/verre';
import { actionsPossibles, contexteActions, estBloquee, type Action } from '@/domain/statuts';
import type { Evenement, Intervention } from '@/domain/types';
import { useMembre, usePermissions } from '@/state/session';
import { halo, useTheme } from '@/theme/tokens';

type Props = {
  intervention: Intervention;
  /** Événements de l’intervention (date de la livraison, pour le gérant) */
  evenements: Evenement[];
  onAction: (a: Action) => Promise<void> | void;
  onPhoto: () => void;
  /** Carré « Bloquer » : feuille Bloquer, étape « type » */
  onBloquer: () => void;
  /** Carré « Préciser » d’une fiche bloquée : feuille Bloquer, étape « modifier » */
  onPreciser: () => void;
};

/** Hauteur de la barre, pour réserver la place sous le contenu. */
export const HAUTEUR_BARRE = 76;

const cle = (a: Action) => `${a.type}-${a.vers ?? 'aucun'}`;

function Carre({
  icone,
  libelle,
  label,
  couleur,
  inerte,
  onPress,
}: {
  icone: 'camera' | 'pause';
  libelle: string;
  label?: string;
  couleur?: string;
  inerte?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? libelle}
      accessibilityState={{ disabled: Boolean(inerte) }}
      disabled={inerte}
      onPress={() => {
        impulsion('leger');
        onPress();
      }}
      className={`h-[58px] w-[66px] items-center justify-center gap-1 rounded-[20px] bg-black/5 dark:bg-white/10 ${inerte ? 'opacity-50' : 'active:opacity-70'}`}>
      <Icone nom={icone} taille={20} couleur={couleur ?? t.ink} poids={icone === 'pause' ? 'bold' : 'medium'} />
      <Text maxFontSizeMultiplier={1.2} numberOfLines={1} className="text-[11px] font-semibold text-muted dark:text-muted-dark">
        {libelle}
      </Text>
    </Pressable>
  );
}

export function BarreActions({ intervention: i, evenements, onAction, onPhoto, onBloquer, onPreciser }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const membre = useMembre();
  const p = usePermissions();
  const garde = useGardeActive();
  const [enCours, setEnCours] = useState<string | null>(null);

  const actions = actionsPossibles(i, contexteActions(membre, p, evenements, { interventionId: i.id }));
  const principale = actions.find((a) => a.principal);
  // Bloquer : une pose est proposée (voiture attendue, reçue ou en cours, pas encore bloquée).
  const peutBloquer = actions.some((a) => a.type === 'blocage' && a.vers !== null);
  // Préciser : le blocage en cours se complète ou se lève depuis la feuille Bloquer.
  const peutPreciser = estBloquee(i) && (i.statut === 'planifie' || i.statut === 'recu' || i.statut === 'en_cours');

  // Libellé changé sans appui (store mis à jour avant la fin de l’écriture,
  // ou geste d’un collègue) : la garde repart du changement.
  const libellePrincipal = principale?.label;
  const premierRendu = useRef(true);
  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }
    armerGarde();
  }, [libellePrincipal]);

  async function lancer(a: Action) {
    if (enCours || garde) return;
    setEnCours(cle(a));
    try {
      await onAction(a);
    } finally {
      // Échec compris : l’avis d’erreur s’affiche ; la garde est armée par le passage de statut.
      setEnCours(null);
    }
  }

  const inerte = enCours !== null || garde;

  let sansGeste = 'Aucune étape à suivre';
  if (i.statut === 'livre') sansGeste = 'Véhicule livré';
  else if (i.statut === 'annule') sansGeste = 'Intervention annulée';
  else if (i.statut === 'termine') sansGeste = 'Remise au client par le comptoir';

  return (
    <View pointerEvents="box-none" className="absolute bottom-0 left-0 right-0 px-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
      <Verre style={{ borderRadius: 30, padding: 8, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Carre icone="camera" libelle="Photo" label="Ajouter une photo" onPress={onPhoto} />
        {peutPreciser ? (
          <Carre icone="pause" libelle="Préciser" label="Préciser l’attente" couleur={t.warn} inerte={inerte} onPress={onPreciser} />
        ) : peutBloquer ? (
          <Carre icone="pause" libelle="Bloquer" label="Signaler un blocage" couleur={t.warn} inerte={inerte} onPress={onBloquer} />
        ) : null}
        {principale ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${principale.label}, action principale`}
            accessibilityState={{ disabled: inerte, busy: enCours !== null }}
            disabled={inerte}
            onPress={() => {
              if (inerte) return;
              impulsion('moyen');
              void lancer(principale);
            }}
            style={t.scheme === 'dark' ? halo(t.accentFond, 18, 0.65) : undefined}
            className={`h-[58px] flex-1 flex-row items-center justify-center gap-2.5 rounded-[20px] bg-accent dark:bg-accent-fond ${
              enCours ? 'opacity-70' : garde ? 'opacity-50' : 'active:opacity-80'
            }`}>
            {enCours === cle(principale) ? (
              <ActivityIndicator color={t.blanc} />
            ) : (
              <>
                <Icone nom="valider" taille={20} couleur={t.blanc} poids="bold" />
                <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit className="text-[18px] font-bold text-white">
                  {principale.label}
                </Text>
              </>
            )}
          </Pressable>
        ) : (
          <View className="h-[58px] flex-1 items-center justify-center px-2">
            <Texte ton="muted" className="text-center text-[15px]" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
              {sansGeste}
            </Texte>
          </View>
        )}
      </Verre>
    </View>
  );
}
