/**
 * SMS : texte tel qu’il part et nombre de SMS facturés. Copie conforme de
 * la partie SMS de `supabase/functions/_partage/texte.ts`, que la fonction
 * Edge `sms` applique à l’envoi : l’aperçu de l’app montre exactement ce
 * que le client recevra et ce que le garage paiera. Le test Deno
 * `supabase/functions/_partage/app-sms.test.ts` importe ce fichier et
 * compare les deux sur un même corpus.
 *
 * Aucun import : le fichier doit rester lisible par Deno (pas d’alias `@/`).
 */

/**
 * Alphabet GSM-7 de base (3GPP TS 23.038, § 6.2.1), un septet par
 * caractère ; 127 signes. En 0x09, la norme dessine un « Ç » majuscule
 * (la table de l’Unicode Consortium le lit « ç ») : Rencar suit la norme,
 * comme Octopush, « ç » sort du GSM-7, « Ç » y reste.
 */
export const GSM7_BASE = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
    '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);

/** Table d’extension GSM-7 : deux septets (caractère d’échappement compris). */
export const GSM7_EXTENSION = new Set('^{}\\[~]|€');

/**
 * Lettres latines absentes du GSM-7, par équivalent sans accent (même
 * table que le serveur, détail dans `_partage/texte.ts`).
 */
const LETTRES_SANS_ACCENT: [string, string][] = [
  ['A', 'ÀÁÂÃĀĂĄǍǞǠǺȀȂȦḀẠẢẤẦẨẪẬẮẰẲẴẶ'],
  ['a', 'áâãāăąǎǟǡǻȁȃȧḁạảấầẩẫậắằẳẵặ'],
  ['B', 'ḂḄḆ'],
  ['b', 'ḃḅḇ'],
  ['C', 'ĆĈĊČḈ'],
  ['c', 'çćĉċčḉ'],
  ['D', 'ĎḊḌḎḐḒĐÐ'],
  ['d', 'ďḋḍḏḑḓđð'],
  ['E', 'ÈÊËĒĔĖĘĚȄȆȨḔḖḘḚḜẸẺẼẾỀỂỄỆ'],
  ['e', 'êëēĕėęěȅȇȩḕḗḙḛḝẹẻẽếềểễệ'],
  ['F', 'Ḟ'],
  ['f', 'ḟ'],
  ['G', 'ĜĞĠĢǦǴḠ'],
  ['g', 'ĝğġģǧǵḡ'],
  ['H', 'ĤȞḢḤḦḨḪĦ'],
  ['h', 'ĥȟḣḥḧḩḫẖħ'],
  ['I', 'ÌÍÎÏĨĪĬĮİǏȈȊḬḮỈỊ'],
  ['i', 'íîïĩīĭįǐȉȋḭḯỉịı'],
  ['J', 'Ĵ'],
  ['j', 'ĵǰ'],
  ['K', 'ĶǨḰḲḴ'],
  ['k', 'ķǩḱḳḵ'],
  ['L', 'ĹĻĽḶḸḺḼŁĿ'],
  ['l', 'ĺļľḷḹḻḽłŀ'],
  ['M', 'ḾṀṂ'],
  ['m', 'ḿṁṃ'],
  ['N', 'ŃŅŇǸṄṆṈṊ'],
  ['n', 'ńņňǹṅṇṉṋ'],
  ['O', 'ÒÓÔÕŌŎŐƠǑǪǬȌȎȪȬȮȰṌṎṐṒỌỎỐỒỔỖỘỚỜỞỠỢ'],
  ['o', 'óôõōŏőơǒǫǭȍȏȫȭȯȱṍṏṑṓọỏốồổỗộớờởỡợ'],
  ['OE', 'Œ'],
  ['oe', 'œ'],
  ['P', 'ṔṖ'],
  ['p', 'ṕṗ'],
  ['R', 'ŔŖŘȐȒṘṚṜṞ'],
  ['r', 'ŕŗřȑȓṙṛṝṟ'],
  ['S', 'ŚŜŞŠȘṠṢṤṦṨ'],
  ['s', 'śŝşšșṡṣṥṧṩ'],
  ['T', 'ŢŤȚṪṬṮṰŦ'],
  ['t', 'ţťțṫṭṯṱẗŧ'],
  ['U', 'ÙÚÛŨŪŬŮŰŲƯǓǕǗǙǛȔȖṲṴṶṸṺỤỦỨỪỬỮỰ'],
  ['u', 'úûũūŭůűųưǔǖǘǚǜȕȗṳṵṷṹṻụủứừửữự'],
  ['V', 'ṼṾ'],
  ['v', 'ṽṿ'],
  ['W', 'ŴẀẂẄẆẈ'],
  ['w', 'ŵẁẃẅẇẉẘ'],
  ['X', 'ẊẌ'],
  ['x', 'ẋẍ'],
  ['Y', 'ÝŶŸȲẎỲỴỶỸ'],
  ['y', 'ýÿŷȳẏẙỳỵỷỹ'],
  ['Z', 'ŹŻŽẐẒẔ'],
  ['z', 'źżžẑẓẕ'],
];

/** Lettre hors GSM-7 → équivalent sans accent (« ç » → « c », « Œ » → « OE »). */
export const SANS_ACCENT: ReadonlyMap<string, string> = new Map(
  LETTRES_SANS_ACCENT.flatMap(([base, lettres]) => [...lettres].map((l): [string, string] => [l, base])),
);

/** Forme composée (NFC) ; texte inchangé si le moteur ne connaît pas `normalize`. */
function composer(texte: string): string {
  try {
    return texte.normalize('NFC');
  } catch {
    return texte;
  }
}

function lettresSansAccent(texte: string): string {
  let s = '';
  for (const c of texte) s += SANS_ACCENT.get(c) ?? c;
  return s;
}

/**
 * Lettres que `normaliserSms` remplace dans ce texte, chacune une fois,
 * dans l’ordre du texte : [["ç", "c"], ["ê", "e"]]. Sert à expliquer
 * l’aperçu (« François » part en « Francois »).
 */
export function lettresRemplacees(texte: string): [string, string][] {
  const vues = new Map<string, string>();
  for (const c of composer(texte)) {
    const r = SANS_ACCENT.get(c);
    if (r !== undefined && !vues.has(c)) vues.set(c, r);
  }
  return [...vues];
}

/**
 * Remplace {prenom} et {garage} dans un gabarit de SMS. Le prénom du client
 * est facultatif : sans lui, {prenom} part avec le blanc qui le précède
 * (« Bonjour {prenom}, » devient « Bonjour, »), et un gabarit qui commence
 * par lui ne garde pas sa ponctuation en tête. Même règle que le serveur,
 * donc même texte et même nombre de SMS.
 */
export function gabaritSms(texte: string, v: { prenom: string; garage: string }): string {
  const prenom = v.prenom.trim();
  const rempli = prenom
    ? texte.replace(/\{prenom\}/g, prenom)
    : texte.replace(/[ \t  ]*\{prenom\}/g, '').replace(/^[\s,;:]+/, '');
  return rempli.replace(/\{garage\}/g, v.garage);
}

/** « Bonjour Hugo », ou « Bonjour » sans prénom (la phrase met la virgule). */
export function salutation(prenom: string): string {
  const p = prenom.trim();
  return p ? `Bonjour ${p}` : 'Bonjour';
}

/**
 * Texte du SMS tel qu’il part : forme composée, ponctuation typographique
 * ramenée au GSM-7 (’ → ', « » “ ” → ", – — → -, … → ..., espaces
 * insécables et fines → espace, blancs réduits), lettres absentes du GSM-7
 * remplacées par leur équivalent sans accent (ç → c, ê → e, œ → oe…). Les
 * lettres du GSM-7 (é, è, à, ù, É, Ç…) et tout le reste ne bougent pas.
 */
export function normaliserSms(texte: string): string {
  return lettresSansAccent(
    composer(texte)
      .replace(/[‘’‛ʼ]/g, "'")
      .replace(/«\s*/g, '"')
      .replace(/\s*»/g, '"')
      .replace(/[“”„‟]/g, '"')
      .replace(/[‐-―−]/g, '-')
      .replace(/…/g, '...')
      .replace(/[​⁠]/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

export type MesureSms = {
  codage: 'gsm7' | 'unicode';
  /** Longueur facturée : septets en GSM-7 (extension comptée double), unités UTF-16 en Unicode */
  unites: number;
  /** Nombre de SMS facturés : GSM-7 160 puis 153 par SMS, Unicode 70 puis 67 */
  segments: number;
  /** Caractères hors GSM-7, chacun une fois, dans l’ordre du texte (vide en GSM-7) */
  horsGsm: string[];
};

/**
 * Codage et nombre de SMS facturés d’un texte déjà normalisé. Même calcul
 * que `mesureSms` côté serveur.
 */
export function mesureSms(texte: string): MesureSms {
  let septets = 0;
  const horsGsm: string[] = [];
  for (const c of texte) {
    if (GSM7_BASE.has(c)) septets += 1;
    else if (GSM7_EXTENSION.has(c)) septets += 2;
    else if (!horsGsm.includes(c)) horsGsm.push(c);
  }
  if (horsGsm.length) {
    const unites = texte.length;
    return { codage: 'unicode', unites, segments: unites <= 70 ? 1 : Math.ceil(unites / 67), horsGsm };
  }
  return { codage: 'gsm7', unites: septets, segments: septets <= 160 ? 1 : Math.ceil(septets / 153), horsGsm };
}
