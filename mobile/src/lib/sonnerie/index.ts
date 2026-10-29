/**
 * Sonnerie dans l'app (option réceptionniste, 0016) : ce téléphone sonne
 * quand le réceptionniste passe un appel à l'équipe, et le premier qui
 * décroche parle au client.
 *
 * Seulement dans « Rencar Test » (`SONNERIE_INCLUSE`, `inclusion.ts`) : dans
 * « Rencar » (App Store, version 1), aucun moteur, pas même le simulateur, et
 * les écrans ne montrent aucune entrée de la sonnerie.
 *
 * Moteur : simulateur en démonstration (web et téléphone, aucun serveur),
 * Twilio Voice sur iPhone en mode supabase, aucun ailleurs (navigateur,
 * Android pour l'instant). Le réglage « Recevoir les appels » de chaque
 * membre vit côté serveur (`appareils_voix`, une ligne par installation).
 *
 * Inscription d'un iPhone : permission du micro (un appel décroché depuis
 * l'écran verrouillé ne peut pas la demander), jeton d'accès Voice (fonction
 * Edge `voix`), `voice.register()`, puis la ligne `appareils_voix` : le
 * serveur ne compose jamais un appareil qui n'est pas inscrit chez Twilio.
 * Réinscription au démarrage si le jeton PushKit change ou après 7 jours.
 * Retrait : la ligne d'abord (plus aucun appel n'est composé), puis
 * `voice.unregister()` ; aussi à la déconnexion et avant la suppression du
 * compte (`quitterSonnerie`).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { BACKEND, repo } from '@/data';
import type { Appel } from '@/domain/types';

import { identifiantAppareil } from './appareil';
import { majTelephone, useTelephone } from './etat';
import { SONNERIE_INCLUSE } from './inclusion';
import type { Moteur } from './moteur';
import { membreDuSimulateur, simulateur, simulerEssai, simulerPassage } from './simulateur';
import { moteurTwilio } from './twilio';

export { useTelephone } from './etat';
export type { AppelActif, AppelEntrant, EtatLigne, Inscription } from './etat';
export { SONNERIE_INCLUSE } from './inclusion';
export { NOM_ESSAI } from './moteur';

const CLE_TRACE = 'rencar.sonnerie.inscription.v1';
const REINSCRIPTION_MS = 7 * 24 * 60 * 60 * 1000;

export const MESSAGE_MICRO_REFUSE = 'Le micro est refusé : autorisez-le dans les réglages du téléphone pour prendre les appels.';

/**
 * Moteur du backend en cours (le simulateur en démonstration, même dans un build supabase) ;
 * aucun dans un binaire sans la sonnerie (« Rencar », App Store, version 1).
 */
export function moteurCourant(): Moteur | null {
  if (!SONNERIE_INCLUSE) return null;
  return BACKEND === 'demo' ? simulateur : moteurTwilio();
}

/** true en démonstration : les appels sont simulés sur ce téléphone. */
export function sonnerieSimulee(): boolean {
  return SONNERIE_INCLUSE && BACKEND === 'demo';
}

/** Pourquoi ce téléphone ne peut pas sonner (null s'il le peut). */
export function raisonIndisponible(): string | null {
  if (moteurCourant()) return null;
  if (Platform.OS === 'web') return 'Indisponible dans le navigateur : la sonnerie fonctionne sur iPhone.';
  if (Platform.OS === 'android') return 'Bientôt disponible sur Android.';
  return 'Mettez l’app à jour pour recevoir les appels sur ce téléphone.';
}

function messageDe(e: unknown, defaut: string): string {
  return e instanceof Error && e.message ? e.message : defaut;
}

// ───────────────────────────────────────────── Trace de la dernière inscription

type Trace = { membreId: string; jetonAppareil: string | null; le: number };

async function lireTrace(): Promise<Trace | null> {
  try {
    const brut = await AsyncStorage.getItem(CLE_TRACE);
    const t = brut ? (JSON.parse(brut) as Partial<Trace>) : null;
    return t && typeof t.membreId === 'string' && typeof t.le === 'number'
      ? { membreId: t.membreId, jetonAppareil: typeof t.jetonAppareil === 'string' ? t.jetonAppareil : null, le: t.le }
      : null;
  } catch {
    return null;
  }
}

async function ecrireTrace(t: Trace | null): Promise<void> {
  try {
    if (t) await AsyncStorage.setItem(CLE_TRACE, JSON.stringify(t));
    else await AsyncStorage.removeItem(CLE_TRACE);
  } catch {
    // non bloquant : au pire, une réinscription de plus au prochain démarrage
  }
}

// ──────────────────────────────────────────────────────────── Micro

type EtatMicro = 'accorde' | 'a_demander' | 'refuse' | 'inconnu';

async function micro(demander: boolean): Promise<EtatMicro> {
  try {
    const A = require('expo-audio') as typeof import('expo-audio');
    const p = demander ? await A.requestRecordingPermissionsAsync() : await A.getRecordingPermissionsAsync();
    if (p.granted) return 'accorde';
    return p.canAskAgain ? 'a_demander' : 'refuse';
  } catch {
    return 'inconnu';
  }
}

// ───────────────────────────────────────────────────────── Inscription

/** Inscription Twilio rafraîchie si le jeton PushKit a changé ou si elle date de plus de 7 jours. */
async function rafraichir(m: Moteur, membreId: string, appareil: string): Promise<void> {
  const trace = await lireTrace();
  const jetonAppareil = await m.jetonAppareil();
  const recente = trace && trace.membreId === membreId && Date.now() - trace.le < REINSCRIPTION_MS;
  if (recente && jetonAppareil && trace.jetonAppareil === jetonAppareil) return;
  const jeton = await repo().jetonVoix();
  if (!jeton) return;
  await m.inscrire(jeton.jeton);
  await repo().inscrireSonnerie(appareil);
  await ecrireTrace({ membreId, jetonAppareil: await m.jetonAppareil(), le: Date.now() });
}

/**
 * Après l'ouverture de session et à chaque changement des droits : relit le
 * réglage de ce téléphone et rafraîchit l'inscription. Ne lève jamais.
 */
export async function synchroniserSonnerie(o: { membreId: string; eligible: boolean }): Promise<void> {
  membreDuSimulateur(o.membreId);
  const m = moteurCourant();
  if (!m) {
    majTelephone({ inscription: 'indisponible', message: raisonIndisponible() });
    return;
  }
  if (!o.eligible) {
    majTelephone({ inscription: 'indisponible', message: null });
    return;
  }
  try {
    const appareil = await identifiantAppareil();
    if (!(await repo().sonnerieInscrite(appareil))) {
      majTelephone({ inscription: 'inactive', message: null });
      return;
    }
    majTelephone({ inscription: 'active', message: null });
    if (m.nom === 'twilio') {
      if ((await micro(false)) === 'refuse') majTelephone({ message: MESSAGE_MICRO_REFUSE });
      await rafraichir(m, o.membreId, appareil);
    }
  } catch (e) {
    majTelephone({ inscription: 'erreur', message: messageDe(e, 'Réglage illisible pour l’instant. Vérifiez la connexion.') });
  }
}

/** « Recevoir les appels » activé sur ce téléphone. Ne lève jamais : l'état dit ce qui s'est passé. */
export async function activerSonnerie(membreId: string): Promise<void> {
  const m = moteurCourant();
  if (!m) return;
  majTelephone({ inscription: 'en_cours', message: null });
  try {
    if (m.nom === 'twilio') {
      const p = await micro(true);
      if (p !== 'accorde') {
        majTelephone({
          inscription: 'inactive',
          message: p === 'refuse' ? MESSAGE_MICRO_REFUSE : 'Le micro est nécessaire pour prendre les appels.',
        });
        return;
      }
      const jeton = await repo().jetonVoix();
      if (!jeton) throw new Error('La sonnerie n’est pas encore branchée pour ce garage.');
      await m.inscrire(jeton.jeton);
    }
    const appareil = await identifiantAppareil();
    await repo().inscrireSonnerie(appareil);
    await ecrireTrace({ membreId, jetonAppareil: await m.jetonAppareil(), le: Date.now() });
    majTelephone({ inscription: 'active', message: null });
  } catch (e) {
    majTelephone({ inscription: 'erreur', message: messageDe(e, 'La sonnerie n’a pas pu être activée. Réessayez avec du réseau.') });
  }
}

/** « Recevoir les appels » désactivé : le serveur cesse aussitôt de composer ce téléphone. */
export async function desactiverSonnerie(): Promise<void> {
  const m = moteurCourant();
  if (!m) return;
  majTelephone({ inscription: 'en_cours', message: null });
  try {
    await repo().retirerSonnerie(await identifiantAppareil());
  } catch (e) {
    majTelephone({ inscription: 'erreur', message: messageDe(e, 'Le réglage n’a pas pu être changé. Réessayez avec du réseau.') });
    return;
  }
  if (m.nom === 'twilio') {
    try {
      const jeton = await repo().jetonVoix();
      if (jeton) await m.desinscrire(jeton.jeton);
    } catch {
      // Sans importance : le serveur ne compose plus ce téléphone.
    }
  }
  await ecrireTrace(null);
  majTelephone({ inscription: 'inactive', message: null });
}

/**
 * Avant la déconnexion ou la suppression du compte : retire ce téléphone,
 * tant que la session est encore ouverte. Six secondes au plus, ne lève jamais.
 */
export async function quitterSonnerie(): Promise<void> {
  const m = moteurCourant();
  if (!m) return;
  const travail = (async () => {
    const appareil = await identifiantAppareil();
    if (!(await repo().sonnerieInscrite(appareil))) return;
    await repo().retirerSonnerie(appareil);
    if (m.nom === 'twilio') {
      const jeton = await repo().jetonVoix();
      if (jeton) await m.desinscrire(jeton.jeton);
    }
  })();
  await Promise.race([travail.catch(() => undefined), new Promise((ok) => setTimeout(ok, 6000))]);
  await ecrireTrace(null);
  majTelephone({ inscription: 'inconnue', message: null, entrant: null });
}

/** « Tester la sonnerie » : ce téléphone sonne dans quelques secondes. */
export async function testerSonnerie(): Promise<void> {
  if (sonnerieSimulee()) {
    simulerEssai();
    return;
  }
  await repo().testerSonnerie();
}

// ──────────────────────────────────────────────────────── Appel en cours

/** Nom affiché d'un appel : prénom et véhicule, comme sur l'écran CallKit (jamais le nom de famille ni la plaque). */
export function nomSonnerie(a: Pick<Appel, 'appelant' | 'contexte'>): string {
  const c = a.contexte?.champs;
  const prenom = (c?.prenom?.valeur ?? a.appelant ?? '').trim().split(/\s+/)[0] ?? '';
  const vehicule = [c?.marque?.valeur, c?.modele?.valeur].map((v) => v?.trim()).filter(Boolean).join(' ');
  return [prenom, vehicule].filter(Boolean).join(' · ') || 'Appel client';
}

/** Démonstration : le réceptionniste passe cet appel à l'équipe. */
export function simulerPassageEquipe(a: Pick<Appel, 'id' | 'appelant' | 'contexte'>): Promise<void> {
  return simulerPassage(a.id, nomSonnerie(a));
}

function moteurOuErreur(): Moteur {
  const m = moteurCourant();
  if (!m) throw new Error(raisonIndisponible() ?? 'La sonnerie n’est pas disponible.');
  return m;
}

export const decrocher = () => moteurOuErreur().decrocher();
export const refuser = () => moteurOuErreur().refuser();
export const raccrocher = () => moteurOuErreur().raccrocher();

export function basculerMicro(): Promise<void> {
  const a = useTelephone.getState().actif;
  return a ? moteurOuErreur().couperMicro(!a.microCoupe) : Promise.resolve();
}

export function basculerHautParleur(): Promise<void> {
  const a = useTelephone.getState().actif;
  return a ? moteurOuErreur().hautParleur(!a.hautParleur) : Promise.resolve();
}
