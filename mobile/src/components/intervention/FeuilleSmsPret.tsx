/**
 * « Prévenir Hugo Bertin » : au passage en Véhicule prêt, aperçu du SMS
 * et choix d’envoyer ou non. Le statut change dans les deux cas ; « Pas
 * maintenant » ferme la feuille sans rien changer. En cas de refus (SMS
 * désactivés, réseau), la feuille se ferme et l’écran affiche l’avis
 * d’erreur reçu par `onErreur`.
 *
 * Disposition pensée pour le double appui : la feuille est ouverte par un
 * geste, elle reste inerte `GARDE_MS` ; les deux choix sont juste sous
 * l’aperçu, et le bas de la feuille, là où retombe le pouce qui vient de
 * toucher « Véhicule prêt », ne porte que « Pas maintenant ».
 *
 * Sans la prestation « Relances SMS », l’envoi par Rencar reste visible,
 * grisé (phrase de `domain/prestations.ts`), et la feuille propose d’écrire
 * au client depuis l’app SMS du téléphone : message « véhicule prêt » du
 * garage et lien de suivi, préremplis.
 *
 * Client sans mobile valide (D6, mobile facultatif) : pas de SMS possible,
 * la feuille le dit et ne propose que le passage en « Véhicule prêt » ;
 * la carte portera « À prévenir ».
 */

import { useState, type ReactElement } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { mobileJoignable } from '@/components/clients/outils';
import { Bouton, Feuille, GARDE_MS, GARDE_PRET_MS, Icone, Legende, Secondaire, Texte, armerGarde, impulsion } from '@/components/ui';
import { repo } from '@/data';
import { fermeA } from '@/domain/echeances';
import { aPrestation, NON_INCLUS } from '@/domain/prestations';
import type { Client, Intervention, Vehicule } from '@/domain/types';
import { appelClient, formaterTelephone, gabaritSms, lettresRemplacees, mesureSms, nomClient, normaliserSms, titreVoiture } from '@/lib/format';
import { lienSuivi, smsHref } from '@/lib/suivi';
import { useDonnees, useMembre } from '@/state/session';
import { useTheme } from '@/theme/tokens';

export type CibleSms = { intervention: Intervention; client?: Client; vehicule?: Vehicule };

/** Le client peut recevoir le SMS « prêt » : un mobile français valide (06, 07). */
export const peutRecevoirSms = (client?: Client) => Boolean(client?.telephone && mobileJoignable(client.telephone));

/** Comment le client a été prévenu au passage en Prêt. */
export type FinSms = 'sms' | 'sans' | 'telephone';

type Props = {
  cible: CibleSms | null;
  onFermer: () => void;
  /**
   * Appelé une fois le statut changé : SMS parti par Rencar, sans SMS (ou
   * envoi échoué), ou message ouvert dans l’app SMS du téléphone.
   */
  onFait?: (fin: FinSms, cible: CibleSms) => void;
  /** Message court en cas d’échec du changement de statut */
  onErreur?: (message: string) => void;
};

export function FeuilleSmsPret({ cible, onFermer, onFait, onErreur }: Props) {
  const membre = useMembre();
  const garage = useDonnees((s) => s.garage);
  const [envoi, setEnvoi] = useState<'sms' | 'sans' | 'telephone' | null>(null);
  const t = useTheme();
  const relancesSms = aPrestation(garage, 'sms');

  const client = cible?.client;
  const texte = cible ? gabaritSms(garage.texteSmsPret, { prenom: client?.prenom ?? '', garage: garage.nom }) : '';
  // Ce qui part : ponctuation ramenée au GSM-7 et lettres hors GSM-7 sans
  // accent (« François » → « Francois »), même règle que le serveur.
  const apercu = normaliserSms(texte);
  const { segments } = mesureSms(apercu);
  const remplacees = lettresRemplacees(texte);
  // Prénom facultatif : le nom suffit (« Prévenir Arnaud », « Écrire à Arnaud »).
  const nom = nomClient(client, 'le client');
  const qui = appelClient(client);
  const smsPossible = peutRecevoirSms(client);
  // Sans relances SMS : le message et le lien de suivi partent de l’app SMS du téléphone.
  const messageTelephone = cible ? `${texte}\n${lienSuivi(cible.intervention.suiviToken)}` : '';

  /** Passe en Prêt, puis fait ce que le choix demande ; la garde suit, succès ou échec. */
  async function valider(choix: FinSms) {
    if (!cible) return;
    setEnvoi(choix);
    try {
      try {
        await repo().changerStatut(cible.intervention.id, 'termine', membre.id);
      } catch (e) {
        impulsion('erreur');
        onErreur?.((e as Error).message || 'Impossible de passer en véhicule prêt.');
        return;
      }
      let fin: FinSms = choix;
      if (choix === 'sms') {
        try {
          await repo().envoyerSmsPret(cible.intervention.id, membre.id, texte);
        } catch {
          // Le statut a changé : l’avis dit que le client n’a pas reçu de SMS (la carte portera « À prévenir »).
          fin = 'sans';
        }
      } else if (choix === 'telephone' && client) {
        // La trace part avec l’ouverture de l’app SMS : la voiture n’est plus « À prévenir », et un
        // retour depuis « Prêt » expliquera au client que sa voiture n’est finalement pas prête.
        const trace = repo()
          .marquerPrevenu(cible.intervention.id, 'sms', membre.id)
          .catch(() => {});
        void Linking.openURL(smsHref(client.telephone, messageTelephone));
        await trace;
      }
      impulsion(choix === 'sms' && fin === 'sans' ? 'erreur' : 'succes');
      onFait?.(fin, cible);
    } finally {
      // Succès ou échec, le geste suivant (« Livré ») attend la fin de la garde.
      armerGarde(GARDE_PRET_MS);
      setEnvoi(null);
      onFermer();
    }
  }

  const pasMaintenant = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Pas maintenant"
      accessibilityHint="Ferme sans changer le statut"
      disabled={envoi !== null}
      onPress={() => {
        impulsion('leger');
        onFermer();
      }}
      className="mt-4 min-h-[52px] items-center justify-center rounded-2xl active:bg-surface2 dark:active:bg-surface2-dark">
      <Texte ton="muted" className="font-semibold">
        Pas maintenant
      </Texte>
    </Pressable>
  );

  // Envoi par Rencar non souscrit : visible, grisé, sans rien à acheter.
  const envoiNonInclus = (
    <View
      className="mt-4 flex-row items-center gap-3 rounded-2xl border border-line px-4 py-3 opacity-60 dark:border-line-dark"
      accessible
      accessibilityLabel={`Envoi du SMS par Rencar. ${NON_INCLUS}`}
      accessibilityState={{ disabled: true }}>
      <Icone nom="cadenas" taille={16} couleur={t.muted} />
      <View className="flex-1">
        <Texte ton="muted">Envoi du SMS par Rencar</Texte>
        <Legende>{NON_INCLUS}</Legende>
      </View>
    </View>
  );

  let contenu: ReactElement | null = null;
  if (!cible) contenu = null;
  else if (!smsPossible || !client) {
    contenu = (
      <View>
        <Secondaire>
          {client ? `${qui} n’a pas de mobile enregistré : pas de SMS possible.` : 'Aucun mobile enregistré : pas de SMS possible.'}
        </Secondaire>
        <View className="mt-4">
          <Bouton onPress={() => valider('sans')} chargement={envoi === 'sans'} accessibilityLabel="Passer en véhicule prêt sans SMS">
            Passer en « Véhicule prêt »
          </Bouton>
        </View>
        {relancesSms ? null : envoiNonInclus}
        {pasMaintenant}
      </View>
    );
  } else if (!relancesSms) {
    contenu = (
      <View>
        <Secondaire>
          {`La voiture passe en « Véhicule prêt ». Écrivez au ${formaterTelephone(client.telephone)} depuis l’app SMS de ce téléphone, lien de suivi compris.`}
        </Secondaire>
        <View className="mt-3 rounded-2xl bg-surface2 dark:bg-surface2-dark p-4">
          <Texte>{messageTelephone}</Texte>
        </View>
        <View className="mt-3 flex-row gap-2">
          <View className="flex-1">
            <Bouton
              onPress={() => valider('telephone')}
              chargement={envoi === 'telephone'}
              desactive={envoi === 'sans'}
              accessibilityLabel={`Passer en véhicule prêt et écrire à ${qui} depuis l’app SMS du téléphone`}>
              Écrire depuis mes SMS
            </Bouton>
          </View>
          <View className="flex-1">
            <Bouton
              variante="secondaire"
              onPress={() => valider('sans')}
              chargement={envoi === 'sans'}
              desactive={envoi === 'telephone'}
              accessibilityLabel="Passer en véhicule prêt sans prévenir le client">
              Sans prévenir
            </Bouton>
          </View>
        </View>
        {envoiNonInclus}
        {pasMaintenant}
      </View>
    );
  } else {
    contenu = (
      <View>
        <Secondaire>
          La voiture passe en « Véhicule prêt ». Envoyer le SMS au {formaterTelephone(client.telephone)}
          {' ?'}
        </Secondaire>
        <View className="mt-3 rounded-2xl bg-surface2 dark:bg-surface2-dark p-4">
          <Texte>{apercu}</Texte>
        </View>
        {fermeA(garage.horaires, new Date()) ? (
          // Le soir ou un jour fermé : le SMS part tout de suite, sa page dira le prochain jour d’ouverture.
          <Legende ton="warn" className="ml-1 mt-2">
            {`Garage fermé à cette heure : ${qui} recevra le SMS tout de suite.`}
          </Legende>
        ) : null}
        <View className="mt-3 flex-row gap-2">
          <View className="flex-1">
            <Bouton
              onPress={() => valider('sms')}
              chargement={envoi === 'sms'}
              desactive={envoi === 'sans'}
              accessibilityLabel={`Envoyer le SMS à ${qui} et passer en véhicule prêt`}>
              Envoyer le SMS
            </Bouton>
          </View>
          <View className="flex-1">
            <Bouton
              variante="secondaire"
              onPress={() => valider('sans')}
              chargement={envoi === 'sans'}
              desactive={envoi === 'sms'}
              accessibilityLabel="Passer en véhicule prêt sans envoyer de SMS">
              Sans SMS
            </Bouton>
          </View>
        </View>
        <Legende className="ml-1 mt-2">
          Expéditeur {garage.expediteurSms} · {apercu.length} caractères · {segments > 1 ? `compte pour ${segments} SMS` : '1 SMS'}
        </Legende>
        {remplacees.length ? (
          <Legende className="ml-1 mt-0.5">{`Envoyé sans accent : ${remplacees.map(([de, vers]) => `${de} → ${vers}`).join(', ')}`}</Legende>
        ) : null}
        {pasMaintenant}
      </View>
    );
  }

  return (
    <Feuille
      ouverte={cible !== null}
      onFermer={onFermer}
      titre={client ? `Prévenir ${nom}` : 'Prévenir le client'}
      legende={cible ? titreVoiture(cible.vehicule) : undefined}
      inerteMs={GARDE_MS}>
      {contenu}
    </Feuille>
  );
}
