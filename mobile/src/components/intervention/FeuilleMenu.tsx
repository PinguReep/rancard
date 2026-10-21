/**
 * Menu « ⋯ » de la fiche : tout ce qui sert moins souvent que le geste
 * suivant. Priorité, mécanicien, lien de suivi pour le client, retour à une
 * étape précédente, annulation.
 */

import * as Clipboard from 'expo-clipboard';
import { Linking, Switch, View } from 'react-native';

import { ETAPES, Feuille, Groupe, Icone, Ligne, Texte, etapeDe, impulsion } from '@/components/ui';
import { actionsPossibles, type Action } from '@/domain/statuts';
import type { Client, Intervention, Statut } from '@/domain/types';
import { lienSuivi, smsHref, texteSmsSuivi } from '@/lib/suivi';
import { useTheme } from '@/theme/tokens';

/** Un retour en arrière se dit comme tel : « Revenir à « Reçu » », pas « Véhicule reçu ». */
export function libelleAutre(a: Action, statut: Statut): string {
  if (a.type !== 'statut') return a.label;
  const de = etapeDe(statut);
  const vers = etapeDe(a.vers);
  return vers >= 0 && vers < de ? `Revenir à « ${ETAPES[vers]} »` : a.label;
}

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  intervention: Intervention;
  client?: Client;
  garage: string;
  /** Option SMS du garage */
  sms: boolean;
  peutAttribuer: boolean;
  onPrioritaire: (v: boolean) => void;
  onAttribuer: () => void;
  onAction: (a: Action) => void;
  onAnnuler: () => void;
  onAvis: (texte: string) => void;
};

export function FeuilleMenu({ ouverte, onFermer, intervention: i, client, garage, sms, peutAttribuer, onPrioritaire, onAttribuer, onAction, onAnnuler, onAvis }: Props) {
  const t = useTheme();
  const actions = actionsPossibles(i);
  const autres = actions.filter((a) => a.type === 'statut' && !a.principal && a.vers !== 'annule');
  const annulable = actions.some((a) => a.type === 'statut' && a.vers === 'annule');

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
    <Feuille ouverte={ouverte} onFermer={onFermer}>
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
        {peutAttribuer ? (
          <Ligne
            onPress={() => {
              onFermer();
              setTimeout(onAttribuer, 260);
            }}
            accessibilityLabel="Changer de mécanicien">
            <Icone nom="clients" taille={16} couleur={t.muted} />
            <Texte className="flex-1">Changer de mécanicien</Texte>
            <Icone nom="chevron.droite" taille={14} couleur={t.faint} />
          </Ligne>
        ) : null}
        {sms && client ? (
          <Ligne
            onPress={() => {
              onFermer();
              void Linking.openURL(smsHref(client.telephone, texteSmsSuivi({ prenom: client.prenom, garage, token: i.suiviToken })));
            }}
            accessibilityLabel={`Envoyer le suivi par SMS à ${client.prenom}`}>
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
          return (
            <Ligne
              key={`${a.type}-${a.vers}`}
              derniere={k === autres.length - 1 && !annulable}
              onPress={() => {
                onFermer();
                setTimeout(() => onAction(a), 240);
              }}
              accessibilityLabel={libelle}>
              <View className="w-4" />
              <Texte className="flex-1">{libelle}</Texte>
            </Ligne>
          );
        })}
        {annulable ? (
          <Ligne
            derniere
            onPress={() => {
              onFermer();
              setTimeout(onAnnuler, 260);
            }}
            accessibilityLabel="Annuler l’intervention">
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
