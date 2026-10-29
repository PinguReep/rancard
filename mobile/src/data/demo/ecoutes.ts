/**
 * Conversations de démonstration à réécouter (fiche de l'appel) :
 *   · a1 (Nicolas Fabre, batterie) : fil des répliques et enregistrement ;
 *   · a5 (Hugo Bertin, pneus) : fil seul, enregistrement indisponible ;
 *   · les autres appels : rien à réécouter.
 *
 * Tout est fictif. L'enregistrement est un son synthétique, sans aucune
 * voix, calé sur les instants du fil (scripts/generer-audio-demo.mjs, qui
 * lit le même fichier ecoutes-demo.json). Même règle de conservation que
 * le serveur : au-delà de 90 jours après l'appel, plus rien.
 */

import { CONSERVATION_ECOUTE_JOURS } from '@/domain/appels';
import type { Appel, EcouteAppel, Replique } from '@/domain/types';

import donnees from './ecoutes-demo.json';

// Fichier local du bundle (require : numéro d'asset pour expo-audio).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AUDIO_DEMO = require('../../../assets/demo/appel-demo.mp3') as number;

type ConversationDemo = { audio: boolean; repliques: Replique[] };

const CONVERSATIONS = donnees as Record<string, ConversationDemo>;

export function ecouteDemo(appel: Pick<Appel, 'id' | 'debut'>, maintenant = Date.now()): EcouteAppel | null {
  const c = Object.prototype.hasOwnProperty.call(CONVERSATIONS, appel.id) ? CONVERSATIONS[appel.id] : undefined;
  if (!c) return null;
  const fin = new Date(appel.debut).getTime() + CONSERVATION_ECOUTE_JOURS * 86_400_000;
  if (!Number.isFinite(fin) || fin <= maintenant) return null;
  return {
    repliques: c.repliques.map((r) => ({ ...r })),
    audio: c.audio ? { etat: 'pret', source: AUDIO_DEMO } : { etat: 'indisponible' },
    conserveJusquAu: new Date(fin).toISOString(),
  };
}
