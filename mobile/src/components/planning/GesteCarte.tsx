/**
 * Bouton « geste suivant » de la carte du planning (D10, repris de la v2b) :
 * « Reçu », « Démarrer », « Prêt », « Livrer · 89 € », ou la levée d’un
 * blocage (« Pièce reçue », « Accord reçu », « Rappelé »). Un appui fait le
 * geste par `usePassageStatut().executer`, sans ouvrir la fiche : garde,
 * avis qui nomme la voiture et sa plaque, « Annuler ».
 *
 * Le geste vient de `gesteCarte` avec le contexte du membre connecté, jamais
 * inventé ici : le mécanicien (sans « Voir les montants ») n’a pas
 * « Livrer », et « Accord reçu » ouvre toujours la feuille Accord (D3).
 * Aucun bouton pour une demande à valider (le pied « Confirmer » existe),
 * une fiche livrée ou annulée.
 *
 * Pendant la garde (après tout changement de statut), le bouton est estompé
 * et inerte. Quand le geste proposé change sans appui (geste d’un collègue
 * reçu en direct), la garde est réarmée : le doigt qui visait l’ancien
 * libellé ne fait pas le suivant.
 */

import { useEffect, useRef } from 'react';
import { Pressable, Text } from 'react-native';

import { Icone, armerGarde, impulsion, useGardeActive } from '@/components/ui';
import { STATUTS, contexteActions, gesteCarte, type Action } from '@/domain/statuts';
import type { Client, Evenement, Intervention, Vehicule } from '@/domain/types';
import { euros, nomClient, voitureEtPlaque } from '@/lib/format';
import { useMembre, usePermissions } from '@/state/session';
import { useTheme } from '@/theme/tokens';

type Props = {
  intervention: Intervention;
  client?: Client;
  vehicule?: Vehicule;
  /** Événements de l’intervention (date de la livraison pour le contexte) */
  evenements?: Evenement[];
  /** Fait le geste : `passage.executer(i, a)` */
  onAction: (a: Action) => void;
};

/** « 89 € » lu « 89 euros ». */
const eurosLus = (n: number) => euros(n).replace(/\s?€/, ' euros');

/**
 * Libellé d’accessibilité, voiture et plaque en fin (sans article) :
 * « Passer en « Véhicule prêt » : Volkswagen Polo AA-004-AA »,
 * « Livrer à Sophie Lambert, 89 euros : Toyota Yaris AA-005-AA »,
 * « Accord reçu, noter l’accord : Audi A4 AA-003-AA ».
 */
export function libelleGeste(a: Action, i: Intervention, vehicule?: Vehicule, client?: Client): string {
  const voiture = voitureEtPlaque(vehicule);
  if (a.type === 'blocage') {
    if (i.blocage === 'attente_accord') return `Accord reçu, noter l’accord : ${voiture}`;
    if (i.blocage === 'rappeler_client') return `Client rappelé : ${voiture}`;
    return `${a.label} : ${voiture}`;
  }
  if (a.vers === 'livre') {
    const qui = client ? ` à ${nomClient(client)}` : '';
    const montant = i.montantEstime != null ? `, ${eurosLus(i.montantEstime)}` : '';
    return `Livrer${qui}${montant} : ${voiture}`;
  }
  return `Passer en « ${STATUTS[a.vers].label} » : ${voiture}`;
}

export function GesteCarte({ intervention: i, client, vehicule, evenements, onAction }: Props) {
  const t = useTheme();
  const membre = useMembre();
  const p = usePermissions();
  const garde = useGardeActive();
  const a = gesteCarte(i, contexteActions(membre, p, evenements, { interventionId: i.id }));

  // Geste changé sans appui (collègue, temps réel) : garde réarmée. La liste
  // recycle ses cellules : seul un changement pour la même voiture compte.
  const cle = a ? `${a.type}-${a.vers ?? 'levee'}` : 'aucun';
  const precedent = useRef<{ id: string; cle: string } | null>(null);
  useEffect(() => {
    const avant = precedent.current;
    precedent.current = { id: i.id, cle };
    if (avant && avant.id === i.id && avant.cle !== cle) armerGarde();
  }, [i.id, cle]);

  if (!a) return null;

  // « Livrer · 89 € » : gesteCarte ne propose « Livrer » qu’avec voirPrix.
  const montant = a.type === 'statut' && a.vers === 'livre' && p.voirPrix && i.montantEstime != null ? ` · ${euros(i.montantEstime)}` : '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelleGeste(a, i, vehicule, client)}
      accessibilityState={{ disabled: garde }}
      disabled={garde}
      hitSlop={{ top: 4, bottom: 4, left: 6, right: 6 }}
      onPress={() => {
        impulsion('moyen');
        onAction(a);
      }}
      className={`h-9 flex-row items-center gap-0.5 rounded-xl bg-accent/10 pl-3 pr-2 dark:bg-accent-dark/20 ${garde ? 'opacity-50' : 'active:opacity-70'}`}>
      <Text maxFontSizeMultiplier={1.4} numberOfLines={1} className="text-[15px] font-semibold text-accent dark:text-accent-dark">
        {a.label}
        {montant}
      </Text>
      <Icone nom="chevron.droite" taille={13} couleur={t.accent} poids="semibold" />
    </Pressable>
  );
}
