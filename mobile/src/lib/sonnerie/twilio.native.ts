/**
 * Moteur Twilio Voice (iPhone) : PushKit et CallKit par le SDK officiel
 * `@twilio/voice-react-native-sdk` 1.8.1 (config plugin Expo, correctif local
 * des plantages #722 et #704 dans `mobile/patches/`).
 *
 * - Le SDK crée le registre PushKit quand `initializePushRegistry()` est
 *   appelé : au tout début du démarrage (module importé par le layout racine,
 *   `demarrage.ts`), avant la session, pour qu'un appel arrivé app tuée soit
 *   signalé à CallKit sans attendre.
 * - Chaque push VoIP est signalé à CallKit par le SDK lui-même (sonnerie
 *   système, écran verrouillé). L'écran d'appel affiche le paramètre
 *   `DisplayName` du TwiML (prénom et véhicule) ; l'app relie l'appel à sa
 *   ligne `appels` par le paramètre `appel`.
 * - Le module est chargé à la demande et protégé : un binaire sans le module
 *   natif (ancien build, Expo Go) n'a simplement pas de sonnerie.
 *
 * Android viendra plus tard (Firebase Cloud Messaging, google-services.json) :
 * aucun moteur sur Android aujourd'hui.
 */

import { Platform } from 'react-native';

import type { AudioDevice, Call, CallInvite, CallKit, Voice } from '@twilio/voice-react-native-sdk';

import { majActif, majTelephone, useTelephone, type AppelEntrant, type EtatLigne } from './etat';
import { NOM_ESSAI, type Moteur } from './moteur';

type Sdk = typeof import('@twilio/voice-react-native-sdk');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let sdk: Sdk | null | undefined;
let voice: Voice | null = null;
let demarrage: Promise<void> | null = null;
const invitations = new Map<string, CallInvite>();
let appel: Call | null = null;
let hautParleurActif = false;

function charger(): Sdk | null {
  if (Platform.OS !== 'ios') return null;
  if (sdk !== undefined) return sdk;
  try {
    sdk = require('@twilio/voice-react-native-sdk') as Sdk;
  } catch {
    // Binaire sans le module natif : pas de sonnerie, rien ne casse.
    sdk = null;
  }
  return sdk;
}

function journal(message: string, e?: unknown) {
  if (__DEV__) console.warn(`[sonnerie] ${message}`, e instanceof Error ? e.message : (e ?? ''));
}

function infoDepuis(params: Record<string, string> | undefined, id: string): AppelEntrant {
  const p = params ?? {};
  const appelId = typeof p.appel === 'string' && UUID.test(p.appel) ? p.appel.toLowerCase() : null;
  const nom = (typeof p.DisplayName === 'string' ? p.DisplayName : '').trim() || NOM_ESSAI;
  return { id, appelId, nom, essai: !appelId };
}

function etatDe(S: Sdk, c: Call): EtatLigne {
  switch (c.getState()) {
    case S.Call.State.Connected:
      return 'en_ligne';
    case S.Call.State.Reconnecting:
      return 'reconnexion';
    case S.Call.State.Disconnected:
      return 'termine';
    default:
      return 'connexion';
  }
}

/** L'appel décroché : état affiché par l'écran d'appel, jusqu'à la fin. */
function suivreAppel(S: Sdk, c: Call, info: AppelEntrant) {
  appel = c;
  const etat = etatDe(S, c);
  majTelephone({
    entrant: null,
    actif: {
      id: c.getSid() ?? info.id,
      appelId: info.appelId,
      nom: info.nom,
      essai: info.essai,
      etat,
      debut: c.getInitialConnectedTimestamp()?.getTime() ?? (etat === 'en_ligne' ? Date.now() : null),
      microCoupe: c.isMuted() ?? false,
      hautParleur: hautParleurActif,
    },
  });
  c.on(S.Call.Event.Connected, () => majActif({ etat: 'en_ligne', debut: Date.now() }));
  c.on(S.Call.Event.Reconnecting, () => majActif({ etat: 'reconnexion' }));
  c.on(S.Call.Event.Reconnected, () => majActif({ etat: 'en_ligne' }));
  const fin = () => {
    if (appel === c) appel = null;
    majActif({ etat: 'termine' });
    // « Appel terminé » reste lisible un instant, puis l'écran se referme.
    setTimeout(() => {
      if (useTelephone.getState().actif?.etat === 'termine') majTelephone({ actif: null });
    }, 1500);
  };
  c.on(S.Call.Event.Disconnected, fin);
  c.on(S.Call.Event.ConnectFailure, fin);
}

/** Un appel qui sonne : CallKit l'affiche déjà ; l'app le montre sur la carte en direct. */
function suivreInvitation(S: Sdk, invite: CallInvite) {
  const sid = invite.getCallSid();
  const params = invite.getCustomParameters() as Record<string, string>;
  const info = infoDepuis(params, sid);
  invitations.set(sid, invite);
  majTelephone({ entrant: info });
  if (!params.DisplayName) invite.updateCallerHandle(NOM_ESSAI).catch(() => undefined);
  const oublier = () => {
    invitations.delete(sid);
    if (useTelephone.getState().entrant?.id === sid) majTelephone({ entrant: null });
  };
  invite.on(S.CallInvite.Event.Accepted, (c: Call) => {
    invitations.delete(sid);
    suivreAppel(S, c, info);
  });
  invite.on(S.CallInvite.Event.Rejected, oublier);
  invite.on(S.CallInvite.Event.Cancelled, oublier);
}

async function initialiser(S: Sdk): Promise<void> {
  const v = new S.Voice();
  voice = v;
  v.on(S.Voice.Event.CallInvite, (invite: CallInvite) => suivreInvitation(S, invite));
  v.on(S.Voice.Event.AudioDevicesUpdated, (_tous: AudioDevice[], choisi?: AudioDevice) => {
    hautParleurActif = choisi?.type === S.AudioDevice.Type.Speaker;
    majActif({ hautParleur: hautParleurActif });
  });
  v.on(S.Voice.Event.Error, (e) => journal('erreur du SDK', e));

  // Appels déjà connus du module natif (JavaScript rechargé pendant un appel, décroché depuis
  // l'écran verrouillé).
  const [invites, appels] = await Promise.all([v.getCallInvites(), v.getCalls()]);
  invites.forEach((invite) => suivreInvitation(S, invite));
  appels.forEach((c) => suivreAppel(S, c, infoDepuis(c.getCustomParameters() as Record<string, string>, c.getSid() ?? '')));

  // Réglages CallKit AVANT le registre PushKit. Le module natif crée son fournisseur CallKit avec
  // la configuration par défaut d'iOS (appels inscrits dans les « Récents ») ; un appel arrivé
  // app tuée est livré dès la création du registre et signalé sur le fournisseur en place. Réglé
  // après, il passait par le fournisseur par défaut. Seulement sans appel en cours : le
  // fournisseur CallKit est recréé.
  if (!invites.size && !appels.size) {
    const configuration: Partial<CallKit.ConfigurationOptions> = {
      // Hors des « Récents » du téléphone : le rappel d'un client passe par la fiche.
      callKitIncludesCallsInRecents: false,
      callKitMaximumCallGroups: 1,
      callKitMaximumCallsPerCallGroup: 1,
    };
    await v.setCallKitConfiguration(configuration as CallKit.ConfigurationOptions);
  }
  await v.setIncomingCallContactHandleTemplate('${DisplayName}');

  // PushKit ensuite : un appel arrivé app tuée attend ce registre, il est livré maintenant.
  await v.initializePushRegistry();
}

function voix(): Voice {
  if (!voice) throw new Error('La sonnerie n’est pas disponible sur ce téléphone.');
  return voice;
}

function avecDelai<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((ok, ko) => {
    const minuterie = setTimeout(() => ko(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(minuterie);
        ok(v);
      },
      (e) => {
        clearTimeout(minuterie);
        ko(e);
      },
    );
  });
}

const moteur: Moteur = {
  nom: 'twilio',

  demarrer() {
    const S = charger();
    if (!S) return Promise.resolve();
    demarrage ??= initialiser(S).catch((e) => {
      journal('démarrage', e);
    });
    return demarrage;
  },

  async inscrire(jeton) {
    await this.demarrer();
    await voix().register(jeton);
  },

  async desinscrire(jeton) {
    await this.demarrer();
    await voix().unregister(jeton);
  },

  async jetonAppareil() {
    if (!voice) return null;
    try {
      return await voice.getDeviceToken();
    } catch {
      return null;
    }
  },

  async decrocher() {
    const id = useTelephone.getState().entrant?.id;
    const invite = id ? invitations.get(id) : undefined;
    if (!invite) {
      majTelephone({ entrant: null });
      throw new Error('Cet appel n’est plus disponible.');
    }
    try {
      // Le SDK ne rend pas toujours la main si l'appel a été pris ailleurs entre-temps.
      await avecDelai(invite.accept(), 10_000, 'L’appel n’a pas pu être décroché.');
    } catch (e) {
      invitations.delete(invite.getCallSid());
      majTelephone({ entrant: null });
      throw e instanceof Error ? e : new Error('L’appel n’a pas pu être décroché.');
    }
  },

  async refuser() {
    const id = useTelephone.getState().entrant?.id;
    const invite = id ? invitations.get(id) : undefined;
    majTelephone({ entrant: null });
    if (invite) await invite.reject().catch(() => undefined);
  },

  async raccrocher() {
    if (appel) await appel.disconnect();
    else majTelephone({ actif: null });
  },

  async couperMicro(coupe) {
    if (!appel) return;
    const resultat = await appel.mute(coupe);
    majActif({ microCoupe: resultat });
  },

  async hautParleur(actif) {
    const S = charger();
    if (!S || !voice) return;
    const { audioDevices } = await voice.getAudioDevices();
    const cible = audioDevices.find((d) => d.type === (actif ? S.AudioDevice.Type.Speaker : S.AudioDevice.Type.Earpiece));
    if (!cible) throw new Error(actif ? 'Haut-parleur indisponible.' : 'Écouteur indisponible.');
    await cible.select();
    hautParleurActif = actif;
    majActif({ hautParleur: actif });
  },
};

export function moteurTwilio(): Moteur | null {
  return charger() ? moteur : null;
}
