/**
 * Actions rapides à l’appui long sur une carte (ou à l’appui sur son état).
 * La feuille nomme la voiture (marque, modèle, plaque) : deux voitures du
 * même client ou deux Toyota ne se confondent pas. Groupes séparés : les
 * gestes en avant (le geste suivant en tête), les blocages (un appui pose
 * le blocage puis ouvre « Préciser »), « Appeler » et le client prévenu
 * d’une voiture prête, les retours, puis « Déplacer… » et « Attribuer à… ».
 *
 * Les actions viennent de `actionsPossibles` avec le contexte du membre
 * connecté (v2c) : pas de « Livré au client » sans « Voir les montants »,
 * « Annuler la livraison » au seul gérant le jour même ; la levée d’une
 * attente d’accord ouvre la feuille Accord. L’annulation de l’intervention
 * reste sur la fiche, derrière sa feuille (motif).
 */

import type { ReactNode } from 'react';
import { Linking, ScrollView, View } from 'react-native';

import { telephoneComposable } from '@/components/clients/outils';

import { estRetour, libelleAutre } from '@/components/intervention/FeuilleMenu';
import { Feuille, Icone, Ligne, Mono, Texte, useGardeActive } from '@/components/ui';
import { actionsPossibles, contexteActions, type Action } from '@/domain/statuts';
import type { CanalPrevenu, Client, Evenement, Intervention, Vehicule } from '@/domain/types';
import { appelClient, euros, formaterTelephone, nomClient as nomDuClient, telHref, titreVoiture } from '@/lib/format';
import { useMembre, usePermissions } from '@/state/session';
import { useTheme } from '@/theme/tokens';

type Props = {
  intervention: Intervention | null;
  client?: Client;
  vehicule?: Vehicule;
  /** Événements de l’intervention (date de la livraison) */
  evenements?: Evenement[];
  peutAttribuer: boolean;
  onFermer: () => void;
  onAction: (a: Action) => void;
  onAttribuer: () => void;
  /** Voiture prête : « Prévenu par téléphone » ou « Répondeur » */
  onPrevenu: (canal: CanalPrevenu) => void;
  /** « Déplacer… » d’un rendez-vous pas encore commencé ; absent sans droit de créer */
  onDeplacer?: () => void;
};

const cle = (a: Action) => `${a.type}-${a.vers ?? 'aucun'}`;

/** Un groupe de lignes, comme `Groupe` mais sans marge propre : la feuille espace ses groupes de 12 pt. */
function Bloc({ children }: { children: ReactNode }) {
  return <View className="overflow-hidden rounded-2xl border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">{children}</View>;
}

/** Libellé d’une action dans la feuille : « Annuler la livraison » plutôt que « Revenir à « Prêt » ». */
function libelle(a: Action, i: Intervention): string {
  if (a.type === 'statut' && i.statut === 'livre' && a.vers === 'termine') return 'Annuler la livraison';
  return libelleAutre(a, i.statut);
}

type LigneSimple = { cle: string; label: string; onPress: () => void; detail?: string; accessibilityLabel?: string };

export function FeuilleActions({ intervention: i, client, vehicule, evenements, peutAttribuer, onFermer, onAction, onAttribuer, onPrevenu, onDeplacer }: Props) {
  const t = useTheme();
  const membre = useMembre();
  const p = usePermissions();
  // Pendant la garde (geste qui vient d’aboutir), les lignes sont estompées et inertes.
  const garde = useGardeActive();
  const actions = i
    ? actionsPossibles(i, contexteActions(membre, p, evenements, { interventionId: i.id })).filter((a) => !(a.type === 'statut' && a.vers === 'annule'))
    : [];

  // L’action principale (statut ou levée d’un blocage) ouvre toujours le premier groupe.
  const enAvant = i ? actions.filter((a) => a.principal || (a.type === 'statut' && !estRetour(a, i.statut) && !(i.statut === 'livre' && a.vers === 'termine'))) : [];
  const blocages = actions.filter((a) => a.type === 'blocage' && !a.principal);
  const retours = i ? actions.filter((a) => !a.principal && a.type === 'statut' && !enAvant.includes(a)) : [];
  enAvant.sort((a, b) => Number(b.principal) - Number(a.principal));

  // Voiture prête : appeler le client d’ici (la feuille reste ouverte pour noter « Prévenu » ou « Répondeur » ensuite).
  const telephone = client?.telephone?.trim() && telephoneComposable(client.telephone) ? client.telephone : null;
  const appeler: LigneSimple[] =
    i?.statut === 'termine' && telephone && client
      ? [
          {
            cle: 'appeler',
            label: `Appeler ${appelClient(client)}`,
            detail: formaterTelephone(telephone),
            accessibilityLabel: `Appeler ${nomDuClient(client)} au ${formaterTelephone(telephone)}`,
            onPress: () => {
              void Linking.openURL(telHref(telephone));
            },
          },
        ]
      : [];
  const prevenu: LigneSimple[] =
    i?.statut === 'termine'
      ? [
          ...appeler,
          { cle: 'prevenu-appel', label: 'Prévenu par téléphone', onPress: () => onPrevenu('appel') },
          { cle: 'prevenu-repondeur', label: 'Répondeur', onPress: () => onPrevenu('repondeur') },
        ]
      : [];
  const organiser: LigneSimple[] = [
    ...(onDeplacer && (i?.statut === 'a_valider' || i?.statut === 'planifie') && p.creer ? [{ cle: 'deplacer', label: 'Déplacer…', onPress: onDeplacer }] : []),
    ...(peutAttribuer ? [{ cle: 'attribuer', label: 'Attribuer à…', onPress: onAttribuer }] : []),
  ];
  const total = actions.length + prevenu.length + organiser.length;

  const nomClient = client ? nomDuClient(client) : null;
  const titre = vehicule ? titreVoiture(vehicule) : (nomClient ?? 'Actions');
  const legende = i ? (vehicule && nomClient ? `${nomClient} · ${i.prestation}` : i.prestation) : undefined;
  // Montant lu avant de rendre la voiture, pour qui a le droit de le voir.
  const montant = p.voirPrix && i?.montantEstime != null ? euros(i.montantEstime) : null;

  function ligne(a: Action, idx: number, groupe: Action[]) {
    const texte = libelle(a, i!);
    const avecMontant = montant && a.type === 'statut' && a.vers === 'livre';
    return (
      <Ligne key={cle(a)} derniere={idx === groupe.length - 1} onPress={() => onAction(a)} accessibilityLabel={avecMontant ? `${texte}, ${montant}` : texte}>
        {/* Poser un blocage : pause ; le lever (« Pièce reçue ») : coche. */}
        {a.type === 'blocage' && !a.principal ? <Icone nom={a.vers ? 'pause' : 'valider'} taille={14} couleur={t.warn} poids="bold" /> : null}
        <Texte ton={a.principal ? 'accent' : 'ink'} className={`flex-1 ${a.principal ? 'font-semibold' : ''}`}>
          {texte}
        </Texte>
        {avecMontant ? <Mono ton="muted">{montant}</Mono> : null}
        {a.principal ? <Icone nom="chevron.droite" taille={16} couleur={t.accent} /> : null}
      </Ligne>
    );
  }

  function simples(lignes: LigneSimple[], chevron: boolean) {
    return lignes.map((l, idx) => (
      <Ligne key={l.cle} derniere={idx === lignes.length - 1} onPress={l.onPress} accessibilityLabel={l.accessibilityLabel ?? l.label}>
        <Texte className="flex-1">{l.label}</Texte>
        {l.detail ? <Mono ton="muted">{l.detail}</Mono> : null}
        {chevron ? <Icone nom="chevron.droite" taille={16} couleur={t.faint} /> : null}
      </Ligne>
    ));
  }

  return (
    <Feuille ouverte={i !== null} onFermer={onFermer} titre={titre} legende={legende}>
      {i ? (
        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          {total === 0 ? (
            <View className="mb-4">
              <Texte>Intervention close, aucune action possible.</Texte>
            </View>
          ) : (
            <View className={`mb-6 gap-3 ${garde ? 'opacity-50' : ''}`} pointerEvents={garde ? 'none' : 'auto'}>
              {enAvant.length ? <Bloc>{enAvant.map((a, k) => ligne(a, k, enAvant))}</Bloc> : null}
              {blocages.length ? <Bloc>{blocages.map((a, k) => ligne(a, k, blocages))}</Bloc> : null}
              {prevenu.length ? <Bloc>{simples(prevenu, false)}</Bloc> : null}
              {retours.length ? <Bloc>{retours.map((a, k) => ligne(a, k, retours))}</Bloc> : null}
              {organiser.length ? <Bloc>{simples(organiser, true)}</Bloc> : null}
            </View>
          )}
        </ScrollView>
      ) : null}
    </Feuille>
  );
}
