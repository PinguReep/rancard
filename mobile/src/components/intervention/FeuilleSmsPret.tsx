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
 * Rédaction par l’IA (option `redactionIa` du garage) : le texte devient
 * un champ, avec « Rédiger avec l’IA » (`RedactionSms`) ; ce qui part est
 * le texte relu du champ, pour toute l’équipe. Avec les relances SMS, un
 * texte modifié part par Rencar si le membre a la permission « Envoyer des
 * SMS modifiés » (`smsLibre`, 0022 : le gérant l’a toujours et la donne dans
 * la fiche d’un membre ; même règle que la fonction `sms`). Sans elle, le
 * message habituel part toujours par Rencar ; dès que le texte change,
 * l’envoi par Rencar se grise avec une phrase neutre et la feuille propose
 * l’app SMS du téléphone (lien de suivi compris), ou de reprendre le
 * message habituel.
 *
 * Client sans mobile valide (D6, mobile facultatif) : pas de SMS possible,
 * la feuille le dit et ne propose que le passage en « Véhicule prêt » ;
 * la carte portera « À prévenir ».
 */

import { useEffect, useState, type ReactElement } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { mobileJoignable } from '@/components/clients/outils';
import { Bouton, Feuille, GARDE_MS, GARDE_PRET_MS, Icone, Legende, Secondaire, Texte, armerGarde, impulsion } from '@/components/ui';
import { repo } from '@/data';
import { fermeA } from '@/domain/echeances';
import { peutEnvoyerSmsModifie } from '@/domain/permissions';
import { aPrestation, NON_INCLUS } from '@/domain/prestations';
import type { Client, Intervention, Vehicule } from '@/domain/types';
import {
  appelClient,
  formaterTelephone,
  gabaritSms,
  lettresRemplacees,
  mesureSms,
  nomClient,
  normaliserSms,
  smsModifie,
  titreVoiture,
} from '@/lib/format';
import { lienSuivi, smsHref } from '@/lib/suivi';
import { useDonnees, useMembre } from '@/state/session';
import { useTheme } from '@/theme/tokens';

import { AuDessusDuClavier, RedactionSms } from './RedactionSms';

export type CibleSms = { intervention: Intervention; client?: Client; vehicule?: Vehicule };

/** Le client peut recevoir le SMS « prêt » : un mobile français valide (06, 07). */
export const peutRecevoirSms = (client?: Client) => Boolean(client?.telephone && mobileJoignable(client.telephone));

/** Sous l’envoi par Rencar grisé, quand un membre sans `smsLibre` a modifié le texte. */
export const RESERVE_SMS_MODIFIE = 'Un texte modifié part par Rencar avec la permission du gérant.';

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
  const smsPossible = peutRecevoirSms(client);
  // Rédaction par l’IA (option du garage) : le texte devient un champ à relire et à modifier, pour
  // toute l’équipe. Avec les relances SMS, un texte modifié part par Rencar avec `smsLibre` (0022).
  const ia = garage.options.redactionIa === true && smsPossible && Boolean(client);
  // Texte du champ ; null tant que rien n’a changé (gabarit du garage).
  const [saisie, setSaisie] = useState<string | null>(null);
  // Remonte le champ quand le message habituel revient (la mention de l’IA repart de zéro).
  const [reprise, setReprise] = useState(0);
  useEffect(() => {
    setSaisie(null);
  }, [cible]);
  const ecrit = ia ? (saisie ?? texte) : texte;
  // Texte modifié sans la permission : l’envoi par Rencar se grise, l’app SMS du téléphone prend le relais.
  const parTelephone = relancesSms && ia && smsModifie(ecrit, texte) && !peutEnvoyerSmsModifie(membre);
  const vide = !ecrit.trim();
  const apercu = normaliserSms(ecrit);
  const { segments } = mesureSms(apercu);
  const remplacees = lettresRemplacees(ecrit);
  // Prénom facultatif : le nom suffit (« Prévenir Arnaud », « Écrire à Arnaud »).
  const nom = nomClient(client, 'le client');
  const qui = appelClient(client);
  // Sans relances SMS : le message et le lien de suivi partent de l’app SMS du téléphone.
  // Un texte rédigé qui porte déjà le lien ne le répète pas.
  const lien = cible ? lienSuivi(cible.intervention.suiviToken) : '';
  const messageTelephone = cible ? (ecrit.includes(lien) ? ecrit.trim() : `${ecrit.trim()}\n${lien}`) : '';

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
          // Le texte relu dans le champ (rédaction par l’IA), sinon le gabarit du garage.
          await repo().envoyerSmsPret(cible.intervention.id, membre.id, ia ? ecrit.trim() : texte);
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
        {ia ? (
          <View className="mt-3">
            <RedactionSms
              key={cible.intervention.id}
              interventionId={cible.intervention.id}
              intention="pret"
              texte={ecrit}
              onTexte={setSaisie}
              qui={qui}
              aide={ecrit.includes(lien) ? undefined : 'Le lien de suivi est ajouté à la fin du message.'}
            />
          </View>
        ) : (
          <View className="mt-3 rounded-2xl bg-surface2 dark:bg-surface2-dark p-4">
            <Texte>{messageTelephone}</Texte>
          </View>
        )}
        <View className="mt-3 flex-row gap-2">
          <View className="flex-1">
            <Bouton
              onPress={() => valider('telephone')}
              chargement={envoi === 'telephone'}
              desactive={envoi === 'sans' || vide}
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
        {ia ? (
          // Le membre relit et modifie ; le décompte dessous suit le texte tel qu’il partira.
          <View className="mt-3">
            <RedactionSms
              key={`${cible.intervention.id}-${reprise}`}
              interventionId={cible.intervention.id}
              intention="pret"
              texte={ecrit}
              onTexte={setSaisie}
              qui={qui}
              aide={parTelephone && !ecrit.includes(lien) ? 'Le lien de suivi est ajouté à la fin du message.' : undefined}
            />
          </View>
        ) : (
          <View className="mt-3 rounded-2xl bg-surface2 dark:bg-surface2-dark p-4">
            <Texte>{apercu}</Texte>
          </View>
        )}
        {!parTelephone && fermeA(garage.horaires, new Date()) ? (
          // Le soir ou un jour fermé : le SMS part tout de suite, sa page dira le prochain jour d’ouverture.
          <Legende ton="warn" className="ml-1 mt-2">
            {`Garage fermé à cette heure : ${qui} recevra le SMS tout de suite.`}
          </Legende>
        ) : null}
        <View className="mt-3 flex-row gap-2">
          <View className="flex-1">
            {parTelephone ? (
              <Bouton
                onPress={() => valider('telephone')}
                chargement={envoi === 'telephone'}
                desactive={envoi === 'sans' || vide}
                accessibilityLabel={`Passer en véhicule prêt et écrire à ${qui} depuis l’app SMS du téléphone`}>
                Écrire depuis mes SMS
              </Bouton>
            ) : (
              <Bouton
                onPress={() => valider('sms')}
                chargement={envoi === 'sms'}
                desactive={envoi === 'sans' || vide}
                accessibilityLabel={`Envoyer le SMS à ${qui} et passer en véhicule prêt`}>
                Envoyer le SMS
              </Bouton>
            )}
          </View>
          <View className="flex-1">
            <Bouton
              variante="secondaire"
              onPress={() => valider('sans')}
              chargement={envoi === 'sans'}
              desactive={envoi === 'sms' || envoi === 'telephone'}
              accessibilityLabel="Passer en véhicule prêt sans envoyer de SMS">
              Sans SMS
            </Bouton>
          </View>
        </View>
        {parTelephone ? (
          <>
            {/* Texte modifié sans la permission : l’envoi par Rencar reste visible, grisé, avec une phrase neutre. */}
            <View
              className="mt-4 flex-row items-center gap-3 rounded-2xl border border-line px-4 py-3 opacity-60 dark:border-line-dark"
              accessible
              accessibilityLabel={`Envoi du SMS par Rencar. ${RESERVE_SMS_MODIFIE}`}
              accessibilityState={{ disabled: true }}>
              <Icone nom="cadenas" taille={16} couleur={t.muted} />
              <View className="flex-1">
                <Texte ton="muted">Envoi du SMS par Rencar</Texte>
                <Legende>{RESERVE_SMS_MODIFIE}</Legende>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reprendre le message habituel du garage, envoyé par Rencar"
              disabled={envoi !== null}
              onPress={() => {
                impulsion('leger');
                setSaisie(null);
                setReprise((n) => n + 1);
              }}
              className="mt-2 min-h-[44px] items-center justify-center rounded-2xl active:bg-surface2 dark:active:bg-surface2-dark">
              <Texte ton="accent" className="font-semibold">
                Reprendre le message habituel
              </Texte>
            </Pressable>
          </>
        ) : null}
        {/* Décompte et accents : seulement pour ce qui part par Rencar. */}
        {parTelephone ? null : (
          <>
            <Legende className="ml-1 mt-2">
              Expéditeur {garage.expediteurSms} · {apercu.length} caractères · {segments > 1 ? `compte pour ${segments} SMS` : '1 SMS'}
            </Legende>
            {remplacees.length ? (
              <Legende className="ml-1 mt-0.5">{`Envoyé sans accent : ${remplacees.map(([de, vers]) => `${de} → ${vers}`).join(', ')}`}</Legende>
            ) : null}
          </>
        )}
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
      {/* Avec le champ du SMS, le clavier ne masque ni le texte ni les boutons. */}
      {ia && contenu ? <AuDessusDuClavier>{contenu}</AuDessusDuClavier> : contenu}
    </Feuille>
  );
}
