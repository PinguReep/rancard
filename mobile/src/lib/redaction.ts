/**
 * Rédaction des SMS par l’IA (option du garage, 0021) : intentions,
 * textes habituels et version de l’accord. Copie conforme des textes de
 * la fonction Edge `redaction` (`supabase/functions/redaction/gabarits.ts`)
 * : le texte proposé avant toute rédaction est celui que le serveur rend en
 * repli. Le test Deno `supabase/functions/redaction/app.test.ts` importe ce
 * fichier et compare les deux.
 *
 * Aucun import : le fichier doit rester lisible par Deno (pas d’alias `@/`).
 */

export type IntentionSms = 'pret' | 'piece' | 'devis' | 'rappel' | 'libre';

export const INTENTIONS_SMS: IntentionSms[] = ['pret', 'piece', 'devis', 'rappel', 'libre'];

export const LIBELLES_INTENTION: Record<IntentionSms, string> = {
  pret: 'Véhicule prêt',
  piece: 'Attente pièce',
  devis: 'Devis à accepter',
  rappel: 'Rappel',
  libre: 'Message libre',
};

/**
 * Version du texte de l’écran d’accord (AAAA-MM-JJ), enregistrée avec
 * l’accord du gérant (`regler_redaction_ia`). À changer avec le texte :
 * l’accord donné à une version antérieure reste tracé tel quel.
 */
export const VERSION_ACCORD_IA = '2026-10-30';

/** Mention sous un texte proposé par l’IA (AI Act 50(1) : relecture humaine réelle). */
export const MENTION_IA = 'Texte proposé par l’IA : relisez avant d’envoyer.';

/** Texte « véhicule prêt » par défaut, celui de `garages.texte_sms_pret` (0013). */
export const TEXTE_SMS_PRET_DEFAUT =
  'Bonjour {prenom}, votre véhicule vous attend. Vous pouvez venir le récupérer aux horaires d’ouverture. {garage}';

function salutation(prenom: string): string {
  const p = prenom.trim();
  return p ? `Bonjour ${p}` : 'Bonjour';
}

/** Même règle que `gabaritSms` (`lib/sms.ts`) : sans prénom, « Bonjour {prenom}, » devient « Bonjour, ». */
function gabarit(texte: string, v: { prenom: string; garage: string }): string {
  const prenom = v.prenom.trim();
  const rempli = prenom
    ? texte.replace(/\{prenom\}/g, prenom)
    : texte.replace(/[ \t  ]*\{prenom\}/g, '').replace(/^[\s,;:]+/, '');
  return rempli.replace(/\{garage\}/g, v.garage);
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** « 8h30 », « 18h » à partir de « 08:30 », « 18:00 ». */
function heureCourte(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? `${Number(m[1])}h${m[2] === '00' ? '' : m[2]}` : hhmm;
}

function minutesDe(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
}

const memeJour = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Créneau d’un rendez-vous dans un SMS, à l’heure du téléphone : « aujourd’hui
 * à 11h », « demain à 8h30 », « le lundi 03/11 à 8h30 ». Même écriture que le
 * serveur (`quandSms`, heure de Paris), date en chiffres.
 */
export function quandSms(iso: string, maintenant = new Date()): string {
  const d = new Date(iso);
  const heure = `${d.getHours()}h${d.getMinutes() ? String(d.getMinutes()).padStart(2, '0') : ''}`;
  if (memeJour(d, maintenant)) return `aujourd’hui à ${heure}`;
  const demain = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1);
  if (memeJour(d, demain)) return `demain à ${heure}`;
  const annee = d.getFullYear() !== maintenant.getFullYear() ? `/${d.getFullYear()}` : '';
  return `le ${JOURS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}${annee} à ${heure}`;
}

/**
 * Quand venir au garage, à l’heure du téléphone : « aujourd’hui de 8h30 à
 * 18h30 » (avant l’ouverture), « aujourd’hui jusqu’à 18h30 », « demain à
 * partir de 8h30 », « le lundi à partir de 8h30 », « aux
 * horaires d’ouverture » sans horaires. Même écriture que le serveur.
 */
export function horairesSms(horaires: Record<number, { de: string; a: string } | null> | null | undefined, maintenant = new Date()): string {
  const repli = 'aux horaires d’ouverture';
  if (!horaires) return repli;
  const plage = horaires[maintenant.getDay()];
  const t = maintenant.getHours() * 60 + maintenant.getMinutes();
  if (plage?.de && plage.a && t < minutesDe(plage.de)) return `aujourd’hui de ${heureCourte(plage.de)} à ${heureCourte(plage.a)}`;
  if (plage?.de && plage.a && t < minutesDe(plage.a)) return `aujourd’hui jusqu’à ${heureCourte(plage.a)}`;
  for (let k = 1; k <= 7; k++) {
    const jour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + k);
    const suivante = horaires[jour.getDay()];
    if (!suivante?.de || !suivante.a) continue;
    return `${k === 1 ? 'demain' : `le ${JOURS[jour.getDay()]}`} à partir de ${heureCourte(suivante.de)}`;
  }
  return repli;
}

/** « 450 € », « 1 250,50 € » (espaces insécables), comme le serveur. */
export function montantSms(n: number): string {
  const [entier, decimales] = (Math.round(n * 100) / 100).toFixed(2).split('.');
  const milliers = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${milliers}${decimales === '00' ? '' : `,${decimales}`} €`;
}

/**
 * Texte habituel d’une intention : proposé dans le champ avant toute
 * rédaction, gardé si la rédaction échoue. `rappel` : `quand` est le
 * créneau déjà rédigé (« demain à 8h30 »).
 */
export function texteHabituel(
  intention: IntentionSms,
  v: { prenom: string; garage: string; texteSmsPret: string; montant: string | null; lien: string; quand?: string },
): string {
  const bonjour = salutation(v.prenom);
  switch (intention) {
    case 'pret':
      return gabarit(v.texteSmsPret || TEXTE_SMS_PRET_DEFAUT, { prenom: v.prenom, garage: v.garage });
    case 'piece':
      return `${bonjour}, nous attendons une pièce pour votre véhicule. Nous vous prévenons dès son arrivée. ${v.garage}`;
    case 'devis':
      return v.montant
        ? `${bonjour}, le devis de votre véhicule s’élève à ${v.montant}. Merci de nous donner votre accord pour lancer les travaux. ${v.garage}`
        : `${bonjour}, le devis de votre véhicule vous attend. Merci de nous donner votre accord pour lancer les travaux. ${v.garage}`;
    case 'rappel':
      return v.quand ? `${bonjour}, rappel de votre rendez-vous ${v.quand}. ${v.garage}` : `${bonjour}, rappel de votre rendez-vous. ${v.garage}`;
    case 'libre':
      // Même début que la bulle « Écrire un SMS » (`texteSmsBulle`, lib/suivi.ts).
      return `${bonjour}, le suivi de votre véhicule : ${v.lien}`;
  }
}
