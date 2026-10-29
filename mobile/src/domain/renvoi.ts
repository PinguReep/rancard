/**
 * Renvoi d’appel de la ligne du garage vers son numéro Rencar (celui que
 * l’agent décroche, `telephonie_garages.numero_ia`, 0011). Le garage garde
 * son numéro ; c’est son opérateur qui renvoie les appels, par un code
 * composé sur la ligne ou depuis son espace client. Rencar ne voit pas ce
 * réglage : l’app donne la marche à suivre et constate seulement qu’un
 * appel est arrivé (`renvoiVerifie`).
 *
 * Aucun import : logique pure, lisible par Deno (test
 * `supabase/functions/_partage/app-renvoi.test.ts`).
 *
 * ── Codes et sources (consultées le 29 octobre 2026) ──────────────────────
 *
 * Portable (codes MMI de la norme ETSI TS 122 030 / 3GPP TS 22.030, les
 * mêmes chez Orange, SFR, Bouygues Telecom et Free Mobile) :
 *   **21*N#  tous les appels          ##21#  l’effacer
 *   **61*N#  sans réponse (délai : **61*N**20#, 5 à 30 s)
 *   **62*N#  portable éteint ou sans réseau
 *   **67*N#  occupé
 *   **004*N# les trois renvois conditionnels d’un coup   ##004#  les effacer
 *   ##002#   efface tous les renvois
 *   Selectra, « Renvoi conditionnel : occupé, absent, injoignable »,
 *   11 septembre 2026 : https://selectra.info/telecom/actualites/marche/renvoi-conditionnel-occupe-absent-injoignable
 *   Échos du Net, « Transfert d’appel », 31 juillet 2026 : https://www.echosdunet.net/aide/transfert-appel
 *   Les forfaits bloqués et cartes prépayées n’ont pas toujours le renvoi.
 *
 * Ligne fixe ou box (codes à composer sur le téléphone de la ligne) :
 *   *21*N#  tous les appels    #21#  l’annuler    *#21#  vérifier
 *   *61*N#  sans réponse       #61#
 *   *69*N#  occupé             #69#
 *   Selectra, « Renvoi d’appel du fixe vers un mobile : codes et coût »,
 *   7 septembre 2026, codes communs à Orange, SFR, Bouygues et Free :
 *   https://selectra.info/telecom/actualites/marche/renvoi-appel-fixe-vers-mobile-codes-cout
 *   · Free (assistance officielle) : *21*N# / #21# / *#21#, article 553 ;
 *     sans réponse *61*N*délai# avec un délai de 5 à 20 secondes, #61#,
 *     article 552 ; occupé *69*N# / #69# / *#69#, article 551 ; aussi dans
 *     l’Espace Abonné, Téléphonie › Gestion de mes services téléphoniques.
 *     0,05 € par minute renvoyée (articles 552 et 553), inclus sur Freebox
 *     Pro depuis le 3 octobre 2024 (Univers Freebox).
 *     https://assistance.free.fr/articles/553, /552, /551
 *   · Bouygues Telecom (assistance officielle, Bbox) : *21*, *61*, *69*
 *     suivis du numéro et de #, annulation #21#, #61#, #69#, tout annuler
 *     #002# ; aussi dans l’espace client, Gérer ma ligne.
 *     https://www.assistance.bouyguestelecom.fr/telephonie-fixe-bbox/services-bbox/renvoi-appel-telephone-fixe
 *   · SFR : *61* et *69* d’après Échos du Net (pas de page officielle
 *     lisible), espace client rubrique téléphonie.
 *     https://www.echosdunet.net/sfr/aide/transfert-appel
 *   · Orange (assistance officielle) : le seul code documenté est *21*N#
 *     (tous les appels), #21# pour l’annuler. Sur une Livebox grand public,
 *     le renvoi sur non-réponse ou occupation ne va que vers la messagerie.
 *     Sur Livebox Pro, il va vers un numéro, depuis l’espace client Pro
 *     (Fixes › Renvoi d’appel) ou l’app Orange Pro (« Sur occupation ou
 *     non-réponse »), ou par le 3000.
 *     https://assistance.orange.fr/telephone/telephone-par-internet/toutes-les-livebox/installer-et-utiliser/rester-joignable/renvoi-d-appel/telephone-par-internet-activer-ou-desactiver-le-renvoi-d-appel_19032-19121
 *     https://assistancepro.orange.fr/telephone_fixe/rester_joignable/renvoi_et_transfert_d_appels/telephone_par_internet_pro__gerer_le_renvoi_dappel-395339
 *     https://assistance.orange.fr/telephone/telephone-fixe/installer-et-utiliser/rester-joignable/transfert-d-appels/telephone-fixe-activer-ou-desactiver-votre-transfert-d-appel_20309-20699
 *
 * iPhone : l’app Téléphone refuse d’ouvrir un lien `tel:` qui contient « * »
 * ou « # » (Apple, « Phone Links », URL Scheme Reference :
 * https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/PhoneLinks/PhoneLinks.html).
 * L’écran copie donc le code ; Android accepte `tel:` avec le code encodé.
 */

export type TypeLigne = 'fixe' | 'mobile';
export type Operateur = 'orange' | 'sfr' | 'bouygues' | 'free' | 'autre';
export type ModeRenvoi = 'conditionnel' | 'tous';

/** Une étape : une phrase, et le code à composer s’il y en a un. */
export type Etape = { texte: string; code?: string };

export type MarcheASuivre = {
  activer: Etape[];
  desactiver: Etape[];
  /** Autre chemin que le code (espace client, application de l’opérateur) */
  autreChemin?: string;
  /** À savoir (coût, limite de l’offre) */
  remarque?: string;
};

export const MODES: Record<ModeRenvoi, { titre: string; description: string }> = {
  conditionnel: {
    titre: 'Si personne ne décroche ou si c’est occupé',
    description: 'Recommandé. L’équipe répond quand elle peut, l’agent prend les appels manqués.',
  },
  tous: {
    titre: 'Tous les appels',
    description: 'Le téléphone du garage ne sonne plus. Pour la fermeture, les congés ou une journée chargée.',
  },
};

export const OPERATEURS: { id: Operateur; label: string }[] = [
  { id: 'orange', label: 'Orange' },
  { id: 'sfr', label: 'SFR' },
  { id: 'bouygues', label: 'Bouygues' },
  { id: 'free', label: 'Free' },
  { id: 'autre', label: 'Autre' },
];

/** Délai avant renvoi demandé par Free sur non-réponse (5 à 20 secondes). */
export const DELAI_FREE_S = 15;

/**
 * Numéro tel qu’il se compose dans un code : « 0465710001 » pour un numéro
 * français, « 00… » pour un numéro étranger (le « + » ne se tape pas sur
 * un téléphone fixe).
 */
export function numeroPourCode(e164: string): string {
  const chiffres = e164.replace(/[^\d+]/g, '');
  if (/^\+33\d{9}$/.test(chiffres)) return `0${chiffres.slice(3)}`;
  return chiffres.startsWith('+') ? `00${chiffres.slice(1)}` : chiffres;
}

/** « 04 65 71 00 01 » pour un numéro français, le numéro international tel quel sinon. */
export function numeroAffiche(e164: string): string {
  const national = numeroPourCode(e164);
  return /^0\d{9}$/.test(national) ? national.replace(/(\d{2})(?=\d)/g, '$1 ') : e164;
}

/** Marche à suivre pour programmer et annuler le renvoi. */
export function marcheASuivre(ligne: TypeLigne, operateur: Operateur, mode: ModeRenvoi, e164: string): MarcheASuivre {
  const n = numeroPourCode(e164);

  if (ligne === 'mobile') {
    return mode === 'conditionnel'
      ? {
          activer: [{ texte: 'Sans réponse, occupé, éteint ou sans réseau, en un seul code.', code: `**004*${n}#` }],
          desactiver: [{ texte: 'Annule ces trois renvois.', code: '##004#' }],
          remarque: 'Délai avant renvoi\u00a0: celui de votre opérateur, souvent 20 secondes. Les forfaits bloqués et cartes prépayées n’ont pas toujours le renvoi.',
        }
      : {
          activer: [{ texte: 'Tous les appels, tout de suite.', code: `**21*${n}#` }],
          desactiver: [{ texte: 'Annule le renvoi.', code: '##21#' }],
          remarque: 'Les forfaits bloqués et cartes prépayées n’ont pas toujours le renvoi.',
        };
  }

  if (operateur === 'orange') {
    return mode === 'conditionnel'
      ? {
          activer: [
            {
              texte:
                'Livebox Pro\u00a0: espace client Orange Pro, Fixes, Renvoi d’appel. Choisissez les appels «\u00a0quand la ligne est occupée ou que vous ne répondez pas\u00a0», puis votre numéro Rencar.',
            },
          ],
          desactiver: [{ texte: 'Même rubrique Renvoi d’appel, dans l’espace client ou l’app Orange Pro\u00a0: désactivez le renvoi.' }],
          autreChemin: 'Ou dans l’app Orange Pro\u00a0: votre ligne fixe, Renvoi d’appel, «\u00a0Sur occupation ou non-réponse\u00a0». Ou par le 3000.',
          remarque:
            'Livebox grand public\u00a0: Orange ne renvoie vers un numéro que tous les appels. Choisissez alors «\u00a0Tous les appels\u00a0».',
        }
      : {
          activer: [{ texte: 'Tous les appels. Attendez le message de confirmation.', code: `*21*${n}#` }],
          desactiver: [{ texte: 'Annule le renvoi.', code: '#21#' }],
          autreChemin: 'Ou depuis l’espace client Orange\u00a0: services de la ligne fixe, Renvoi d’appel, ou par le 3000.',
        };
  }

  const free = operateur === 'free';
  const autreChemin: Record<Exclude<Operateur, 'orange'>, string> = {
    free: 'Ou depuis l’Espace Abonné Free\u00a0: Téléphonie, Gestion de mes services téléphoniques.',
    bouygues: 'Ou depuis l’espace client Bouygues Telecom\u00a0: votre ligne Bbox, Gérer ma ligne.',
    sfr: 'Ou depuis l’espace client SFR, rubrique téléphonie de la ligne fixe.',
    autre: 'Ce sont les codes les plus répandus. S’ils ne passent pas, réglez le renvoi depuis l’espace client de votre opérateur.',
  };
  const remarque = free
    ? 'Free facture 0,05\u00a0€ par minute renvoyée sur une Freebox grand public\u00a0; c’est inclus sur Freebox Pro.'
    : undefined;

  return mode === 'conditionnel'
    ? {
        activer: [
          {
            texte: free ? `Si personne ne décroche après ${DELAI_FREE_S} secondes.` : 'Si personne ne décroche.',
            code: free ? `*61*${n}*${DELAI_FREE_S}#` : `*61*${n}#`,
          },
          { texte: 'Si la ligne est occupée.', code: `*69*${n}#` },
        ],
        desactiver: [
          { texte: 'Annule le renvoi sans réponse.', code: '#61#' },
          { texte: 'Annule le renvoi sur occupation.', code: '#69#' },
        ],
        autreChemin: autreChemin[operateur],
        remarque,
      }
    : {
        activer: [{ texte: 'Tous les appels, tout de suite.', code: `*21*${n}#` }],
        desactiver: [{ texte: 'Annule le renvoi.', code: '#21#' }],
        autreChemin: autreChemin[operateur],
        remarque,
      };
}

/** Phrase de l’essai à faire une fois le renvoi programmé. */
export function phraseEssai(mode: ModeRenvoi): string {
  return mode === 'conditionnel'
    ? 'Appelez votre numéro depuis un autre téléphone et laissez sonner sans décrocher\u00a0: l’agent doit répondre.'
    : 'Appelez votre numéro depuis un autre téléphone\u00a0: l’agent doit répondre.';
}

/** Un appel arrivé par le réseau depuis moins de 7 jours prouve que le renvoi passe. */
export const RENVOI_VERIFIE_JOURS = 7;

/**
 * État constaté du renvoi, d’après le dernier appel arrivé par le réseau
 * sur le numéro Rencar du garage : « verifie » s’il date de moins de
 * `RENVOI_VERIFIE_JOURS` jours, « ancien » au-delà, « aucun » sans appel.
 * Ce n’est qu’un constat : Rencar ne lit pas le réglage de l’opérateur, et
 * un appel composé directement sur le numéro Rencar compterait aussi.
 */
export function etatRenvoi(dernierAppelLe: string | null, maintenant = Date.now()): 'verifie' | 'ancien' | 'aucun' {
  if (!dernierAppelLe) return 'aucun';
  const t = new Date(dernierAppelLe).getTime();
  if (Number.isNaN(t)) return 'aucun';
  return maintenant - t <= RENVOI_VERIFIE_JOURS * 86_400_000 ? 'verifie' : 'ancien';
}
