/**
 * Menu « ⋯ » de la fiche : tout ce qui sert moins souvent que le geste
 * suivant. Priorité, mécanicien, rendez-vous et retour prévu, lien de suivi
 * pour le client, retour à une étape précédente, annulation.
 *
 * Les gestes de statut viennent de `actionsPossibles` avec le contexte du
 * membre connecté (`contexteActions`) : « Annuler l’intervention » demande
 * « Créer des interventions » (D3, jamais le mécanicien) et ouvre la
 * feuille du motif ; « Annuler la livraison » est réservée au gérant, le
 * jour de la livraison (D4) ; une fiche annulée se « Reprogramme » vers un
 * créneau à venir. « Envoyer le suivi au client » ouvre l’app Messages
 * (lien `sms:`, sans frais) dès que le client a un mobile, avec ou sans la
 * prestation « Relances SMS » (D6).
 */

import * as Clipboard from 'expo-clipboard';
import { Linking, Switch } from 'react-native';

import { mobileJoignable } from '@/components/clients/outils';
import { ETAPES, Feuille, Groupe, Icone, Ligne, Texte, etapeDe, impulsion } from '@/components/ui';
import { actionsPossibles, contexteActions, type Action } from '@/domain/statuts';
import type { Client, Evenement, Intervention, Statut, Vehicule } from '@/domain/types';
import { appelClient, nomClient, titreVoiture } from '@/lib/format';
import { lienSuivi, smsHref, texteSmsSuivi } from '@/lib/suivi';
import { useMembre, usePermissions } from '@/state/session';
import { useTheme } from '@/theme/tokens';

/** Le temps que la feuille se ferme avant d’ouvrir la suivante (iOS : une fenêtre modale à la fois). */
const FERMETURE_MS = 260;

/**
 * Un retour en arrière se dit comme tel : « Revenir à « Reçu » », pas
 * « Véhicule reçu » ; un « Véhicule reçu » touché trop tôt se défait par
 * « Pas encore arrivé », une livraison par « Annuler la livraison » (gérant,
 * le jour même), une annulation par « Reprogrammer… » (créneau à venir).
 */
export function libelleAutre(a: Action, statut: Statut): string {
  if (a.type !== 'statut') return a.label;
  if (statut === 'recu' && a.vers === 'planifie') return 'Pas encore arrivé';
  if (statut === 'annule' && a.vers === 'planifie') return 'Reprogrammer…';
  if (statut === 'livre' && a.vers === 'termine') return 'Annuler la livraison';
  const de = etapeDe(statut);
  const vers = etapeDe(a.vers);
  return vers >= 0 && vers < de ? `Revenir à « ${ETAPES[vers]} »` : a.label;
}

/** Geste qui revient en arrière (« Revenir à … », « Pas encore arrivé », « Annuler la livraison »). */
export function estRetour(a: Action, statut: Statut): boolean {
  if (a.type !== 'statut') return false;
  if (statut === 'recu' && a.vers === 'planifie') return true;
  const vers = etapeDe(a.vers);
  return vers >= 0 && vers < etapeDe(statut);
}

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  intervention: Intervention;
  client?: Client;
  vehicule?: Vehicule;
  /** Nom du garage, pour le SMS de suivi */
  garage: string;
  /** Événements de l’intervention (date de la livraison) */
  evenements: Evenement[];
  onPrioritaire: (v: boolean) => void;
  /** Changer de mécanicien (« Voir tout le planning ») */
  onAttribuer?: () => void;
  /** Déplacer le rendez-vous (à valider ou confirmé, « Créer des interventions ») */
  onDeplacer?: () => void;
  /** Retour prévu (voiture reçue, en cours ou prête, « Créer des interventions ») */
  onRetourPrevu?: () => void;
  /** Geste de statut (retours, livraison annulée, reprogrammation) : passe par `executer` */
  onAction: (a: Action) => void;
  /** Ouvre la feuille d’annulation (motif) */
  onAnnuler: () => void;
  onAvis: (texte: string) => void;
};

export function FeuilleMenu({
  ouverte,
  onFermer,
  intervention: i,
  client,
  vehicule,
  garage,
  evenements,
  onPrioritaire,
  onAttribuer,
  onDeplacer,
  onRetourPrevu,
  onAction,
  onAnnuler,
  onAvis,
}: Props) {
  const t = useTheme();
  const membre = useMembre();
  const p = usePermissions();
  const actions = actionsPossibles(i, contexteActions(membre, p, evenements, { interventionId: i.id }));
  // Retours, livraison annulée, reprogrammation (créer seulement) ; l’annulation a sa propre ligne.
  const autres = actions.filter(
    (a) => a.type === 'statut' && !a.principal && a.vers !== 'annule' && !(i.statut === 'annule' && a.vers === 'planifie' && !p.creer),
  );
  const annulable = actions.some((a) => a.type === 'statut' && a.vers === 'annule');
  const mobile = client?.telephone && mobileJoignable(client.telephone) ? client.telephone : null;
  const deplacer = onDeplacer && (i.statut === 'a_valider' || i.statut === 'planifie') ? onDeplacer : undefined;
  const retourPrevu = onRetourPrevu && (i.statut === 'recu' || i.statut === 'en_cours' || i.statut === 'termine') ? onRetourPrevu : undefined;

  /** Ferme le menu, puis ouvre la feuille suivante. */
  const ensuite = (geste: () => void) => () => {
    onFermer();
    setTimeout(geste, FERMETURE_MS);
  };

  async function copier() {
    try {
      await Clipboard.setStringAsync(lienSuivi(i.suiviToken));
      impulsion('succes');
      onFermer();
      onAvis('Lien de suivi copié');
    } catch {
      onAvis('Copie impossible sur cet appareil');
    }
  }

  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre={titreVoiture(vehicule)} legende={[client ? nomClient(client) : null, i.prestation].filter(Boolean).join(' · ')}>
      <Groupe>
        <Ligne>
          <Icone nom="drapeau" taille={16} couleur={t.danger} />
          <Texte className="flex-1">Prioritaire</Texte>
          <Switch
            value={i.prioritaire}
            onValueChange={(v) => {
              impulsion('leger');
              onPrioritaire(v);
            }}
            trackColor={{ true: t.accentFond, false: t.line }}
            thumbColor={t.blanc}
            {...({ activeThumbColor: t.blanc } as object)}
            ios_backgroundColor={t.line}
            accessibilityLabel="Prioritaire"
          />
        </Ligne>
        {onAttribuer && p.voirTout ? (
          <Ligne onPress={ensuite(onAttribuer)} accessibilityLabel="Changer de mécanicien">
            <Icone nom="clients" taille={16} couleur={t.muted} />
            <Texte className="flex-1">Changer de mécanicien</Texte>
            <Icone nom="chevron.droite" taille={14} couleur={t.faint} />
          </Ligne>
        ) : null}
        {deplacer ? (
          <Ligne onPress={ensuite(deplacer)} accessibilityLabel="Déplacer le rendez-vous">
            <Icone nom="planning" taille={16} couleur={t.muted} />
            <Texte className="flex-1">Déplacer le rendez-vous</Texte>
            <Icone nom="chevron.droite" taille={14} couleur={t.faint} />
          </Ligne>
        ) : null}
        {retourPrevu ? (
          <Ligne onPress={ensuite(retourPrevu)} accessibilityLabel="Retour prévu">
            <Icone nom="horloge" taille={16} couleur={t.muted} />
            <Texte className="flex-1">Retour prévu…</Texte>
            <Icone nom="chevron.droite" taille={14} couleur={t.faint} />
          </Ligne>
        ) : null}
        {/* App SMS du téléphone : du socle, avec ou sans la prestation « Relances SMS ». */}
        {client && mobile ? (
          <Ligne
            onPress={() => {
              onFermer();
              void Linking.openURL(smsHref(mobile, texteSmsSuivi({ prenom: client.prenom, garage, token: i.suiviToken })));
            }}
            accessibilityLabel={`Envoyer le suivi par SMS à ${appelClient(client)}`}>
            <Icone nom="message" taille={16} couleur={t.muted} />
            <Texte className="flex-1">Envoyer le suivi au client</Texte>
          </Ligne>
        ) : null}
        <Ligne onPress={() => void copier()} derniere={autres.length === 0 && !annulable} accessibilityLabel="Copier le lien de suivi">
          <Icone nom="lien" taille={16} couleur={t.muted} />
          <Texte className="flex-1">Copier le lien de suivi</Texte>
        </Ligne>
        {autres.map((a, k) => {
          const libelle = libelleAutre(a, i.statut);
          const reprogrammer = i.statut === 'annule' && a.vers === 'planifie';
          const livraison = i.statut === 'livre' && a.vers === 'termine';
          return (
            <Ligne
              key={`${a.type}-${a.vers}`}
              derniere={k === autres.length - 1 && !annulable}
              onPress={ensuite(() => onAction(a))}
              accessibilityLabel={libelle.replace('…', '')}>
              {reprogrammer ? (
                <Icone nom="calendrier" taille={16} couleur={t.muted} />
              ) : estRetour(a, i.statut) ? (
                <Icone nom="annuler" taille={16} couleur={livraison ? t.warn : t.muted} />
              ) : (
                <Icone nom="valider" taille={16} couleur={t.muted} />
              )}
              <Texte className="flex-1">{libelle}</Texte>
            </Ligne>
          );
        })}
        {annulable ? (
          <Ligne derniere onPress={ensuite(onAnnuler)} accessibilityLabel="Annuler l’intervention">
            <Icone nom="fermer" taille={14} couleur={t.danger} poids="bold" />
            <Texte ton="danger" className="flex-1">
              Annuler l’intervention
            </Texte>
          </Ligne>
        ) : null}
      </Groupe>
    </Feuille>
  );
}
