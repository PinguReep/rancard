/**
 * Simulateur de sonnerie, pour la démonstration (web et téléphone) : aucun
 * serveur ni Twilio. Il montre le parcours complet avec les données du garage
 * de démonstration : le réceptionniste passe l'appel en cours à l'équipe, ce
 * téléphone sonne (bandeau dans l'app à la place de CallKit), on décroche,
 * l'écran d'appel s'ouvre ; la carte en direct suit (DemoRepo.simulerTransfert,
 * comme les rappels de Twilio le feraient). Sans réponse en 20 secondes, ou
 * après un refus, l'appel part en « à rappeler ».
 */

import { repo } from '@/data';
import type { EtatTransfert } from '@/domain/types';

import { majActif, majTelephone, useTelephone } from './etat';
import { NOM_ESSAI, type Moteur } from './moteur';

/** Durée de sonnerie, comme le `<Dial timeout="20">` du serveur. */
const SONNERIE_MS = 20_000;

type RepoDemo = {
  simulerTransfert?: (appelId: string, etat: EtatTransfert, o?: { membreId?: string; dureeSec?: number }) => Promise<void>;
};

let membreId: string | null = null;
let minuterie: ReturnType<typeof setTimeout> | null = null;

function transfert(appelId: string | null, etat: EtatTransfert, o: { membreId?: string; dureeSec?: number } = {}) {
  if (!appelId) return Promise.resolve();
  const r = repo() as unknown as RepoDemo;
  return r.simulerTransfert?.(appelId, etat, o) ?? Promise.resolve();
}

function arreterMinuterie() {
  if (minuterie) clearTimeout(minuterie);
  minuterie = null;
}

/** Membre de la session de démonstration (celui qui « décroche »). */
export function membreDuSimulateur(id: string | null): void {
  membreId = id;
}

/**
 * Ce téléphone sonne, sauf pour un passage à l'équipe quand « Recevoir les
 * appels » est coupé : comme en vrai, il ne sonne pas, et sans réponse au
 * bout de 20 secondes l'appel part en « à rappeler ».
 */
function sonner(appelId: string | null, nom: string, essai: boolean) {
  arreterMinuterie();
  const ici = essai || useTelephone.getState().inscription === 'active';
  if (ici) majTelephone({ entrant: { id: `sim_${Date.now().toString(36)}`, appelId, nom, essai } });
  minuterie = setTimeout(() => {
    minuterie = null;
    const e = useTelephone.getState().entrant;
    if (ici && (!e || e.appelId !== appelId)) return;
    if (e?.appelId === appelId) majTelephone({ entrant: null });
    void transfert(appelId, 'sans_reponse');
  }, SONNERIE_MS);
}

/** Démonstration : le réceptionniste passe cet appel en cours à l'équipe. */
export async function simulerPassage(appelId: string, nom: string): Promise<void> {
  await transfert(appelId, 'sonne');
  sonner(appelId, nom, false);
}

/** Démonstration : « Tester la sonnerie ». */
export function simulerEssai(): void {
  setTimeout(() => sonner(null, NOM_ESSAI, true), 1200);
}

export const simulateur: Moteur = {
  nom: 'simulateur',
  demarrer: () => Promise.resolve(),
  inscrire: () => Promise.resolve(),
  desinscrire: () => Promise.resolve(),
  jetonAppareil: () => Promise.resolve(null),

  async decrocher() {
    const e = useTelephone.getState().entrant;
    if (!e) throw new Error('Cet appel n’est plus disponible.');
    arreterMinuterie();
    majTelephone({
      entrant: null,
      actif: { ...e, etat: 'connexion', debut: null, microCoupe: false, hautParleur: false },
    });
    await transfert(e.appelId, 'en_ligne', { membreId: membreId ?? undefined });
    setTimeout(() => {
      if (useTelephone.getState().actif?.id === e.id) majActif({ etat: 'en_ligne', debut: Date.now() });
    }, 700);
  },

  async refuser() {
    const e = useTelephone.getState().entrant;
    arreterMinuterie();
    majTelephone({ entrant: null });
    // En démonstration, ce téléphone est le seul à sonner : personne d'autre ne décroche.
    await transfert(e?.appelId ?? null, 'sans_reponse');
  },

  async raccrocher() {
    const a = useTelephone.getState().actif;
    if (!a) return;
    majActif({ etat: 'termine' });
    const dureeSec = a.debut ? Math.round((Date.now() - a.debut) / 1000) : 0;
    await transfert(a.appelId, 'termine', { dureeSec });
    setTimeout(() => {
      if (useTelephone.getState().actif?.id === a.id) majTelephone({ actif: null });
    }, 1200);
  },

  couperMicro(coupe) {
    majActif({ microCoupe: coupe });
    return Promise.resolve();
  },

  hautParleur(actif) {
    majActif({ hautParleur: actif });
    return Promise.resolve();
  },
};
