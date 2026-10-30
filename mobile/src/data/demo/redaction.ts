/**
 * Rédaction simulée du mode démonstration : aucun réseau, aucun modèle. Des
 * tournures écrites à la main, avec les mêmes repères que la fonction Edge
 * `redaction` ({prenom}, {vehicule}, {garage}, {horaires}, {montant},
 * {rendezvous}), remplies sur le téléphone. Même règles que le serveur : un
 * seul SMS GSM-7 une fois préparé pour l’envoi, pas de {montant} sans
 * « Voir les montants », texte habituel si rien ne tient. Chaque nouvel
 * appui propose la tournure suivante (« Autre proposition »).
 */

import type { Client, Garage, Intervention, Vehicule } from '@/domain/types';
import { horairesSms, type IntentionSms, montantSms, quandSms, texteHabituel } from '@/lib/redaction';
import { gabaritSms, mesureSms, normaliserSms } from '@/lib/sms';
import { lienSuivi } from '@/lib/suivi';

const TOURNURES: Record<IntentionSms, string[]> = {
  pret: [
    'Bonjour {prenom}, bonne nouvelle : votre {vehicule} vous attend. Vous pouvez venir le récupérer {horaires}. {garage}',
    'Bonjour {prenom}, les travaux sur votre {vehicule} sont terminés. Nous vous attendons {horaires}. {garage}',
  ],
  piece: [
    'Bonjour {prenom}, nous attendons une pièce pour votre {vehicule}. Nous vous écrivons dès son arrivée pour la suite des travaux. {garage}',
    'Bonjour {prenom}, la réparation de votre {vehicule} attend une pièce. Nous revenons vers vous dès qu’elle arrive. {garage}',
  ],
  devis: [
    'Bonjour {prenom}, le devis de votre {vehicule} s’élève à {montant}. Dites-nous si vous l’acceptez et nous lancerons les travaux. {garage}',
    'Bonjour {prenom}, le devis de votre {vehicule} vous attend. Dites-nous si vous l’acceptez et nous lancerons les travaux. {garage}',
  ],
  rappel: [
    'Bonjour {prenom}, petit rappel : nous vous attendons {rendezvous} pour votre {vehicule}. {garage}',
    'Bonjour {prenom}, nous vous rappelons votre rendez-vous {rendezvous} pour votre {vehicule}. À bientôt, {garage}',
  ],
  libre: ['Bonjour {prenom}, au sujet de votre {vehicule} : {note}. {garage}', 'Bonjour {prenom}, {note}. {garage}'],
};

/** Note de l’équipe en fin de phrase : première lettre en minuscule, sans point final. */
function phrase(note: string): string {
  const n = note.replace(/\s+/g, ' ').trim().replace(/[.!?…]+$/, '');
  return n ? n.charAt(0).toLowerCase() + n.slice(1) : '';
}

function unSms(texte: string): boolean {
  const m = mesureSms(normaliserSms(texte));
  return m.codage === 'gsm7' && m.segments === 1;
}

export function redactionDemo(o: {
  intention: IntentionSms;
  note?: string;
  garage: Garage;
  intervention: Intervention;
  client?: Client;
  vehicule?: Vehicule;
  voirPrix: boolean;
  /** Numéro de la proposition (0, 1, 2…) : la tournure suivante à chaque appui */
  tirage: number;
  maintenant?: Date;
}): { texte: string; ia: boolean } {
  const maintenant = o.maintenant ?? new Date();
  const i = o.intervention;
  const prenom = o.client?.prenom?.trim() ?? '';
  const montant = o.voirPrix && i.montantEstime != null ? montantSms(i.montantEstime) : null;
  const rendezvous = new Date(i.debut).getTime() > maintenant.getTime() ? quandSms(i.debut, maintenant) : null;
  const valeurs: Record<string, string | null> = {
    vehicule: [o.vehicule?.marque, o.vehicule?.modele].filter(Boolean).join(' ') || 'véhicule',
    horaires: horairesSms(o.garage.horaires, maintenant),
    montant,
    rendezvous,
    note: o.note ? phrase(o.note) : null,
  };
  const habituel = texteHabituel(o.intention, {
    prenom,
    garage: o.garage.nom,
    texteSmsPret: o.garage.texteSmsPret,
    montant,
    lien: lienSuivi(i.suiviToken),
    quand: rendezvous ?? undefined,
  });

  // Hors message libre, la note devient une phrase de plus avant la signature, si le SMS la tient.
  const base = TOURNURES[o.intention];
  const avecNote = o.intention !== 'libre' && valeurs.note ? base.map((t) => t.replace(/ \{garage\}$/, ' {Note}. {garage}')) : [];
  if (valeurs.note) valeurs.Note = valeurs.note.charAt(0).toUpperCase() + valeurs.note.slice(1);
  const tournures = [...avecNote, ...base];
  for (let k = 0; k < tournures.length; k++) {
    const modele = tournures[(o.tirage + k) % tournures.length];
    // Un repère sans valeur (montant caché, rendez-vous passé, pas de note) écarte la tournure.
    const manquant = Object.entries(valeurs).some(([r, v]) => v === null && modele.includes(`{${r}}`));
    if (manquant) continue;
    let texte = gabaritSms(modele, { prenom, garage: o.garage.nom });
    for (const [r, v] of Object.entries(valeurs)) if (v !== null) texte = texte.split(`{${r}}`).join(v);
    if (unSms(texte)) return { texte, ia: true };
  }
  return { texte: habituel, ia: false };
}
