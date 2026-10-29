/**
 * Bandeau de la fiche, sous l’en-tête (v2c, repris de la v2b et refait sur
 * les données du serveur) : le pourquoi et le quand d’une voiture. Ce qu’on
 * attend et pour quand, depuis quand l’accord est demandé et si le devis
 * est parti, si le client d’une voiture prête est prévenu, et le dernier
 * accord noté. Il ne s’affiche que s’il a quelque chose à dire.
 *
 * Le mot du blocage (« Attente pièce ») est déjà dans la pastille de
 * l’en-tête : le bandeau dit le reste, sans doublon. Les gestes qu’il porte
 * sont secondaires (« Préciser », « Devis envoyé », « Prévenu par
 * téléphone », « Répondeur ») : l’action principale reste dans la barre.
 * Aucun montant sans « Voir les montants ».
 */

import { format, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Carte, Icone, Texte, impulsion, type NomIcone } from '@/components/ui';
import { bloqueeDepuis, prevenuDe, preteDepuis, repereCarte, type Ton } from '@/domain/echeances';
import { CANAUX_ACCORD, estBloquee } from '@/domain/statuts';
import type { CanalPrevenu, Evenement, Intervention, Membre } from '@/domain/types';
import { dePrenom, depuisCourt, depuisLong, euros, heure, jourCourt, sansHeure } from '@/lib/format';
import { usePermissions } from '@/state/session';
import { useTheme } from '@/theme/tokens';

type Props = {
  intervention: Intervention;
  /** Événements de l’intervention (pose du blocage, passage en Prêt, SMS) */
  evenements: Evenement[];
  membres: Membre[];
  /** Ouvre la feuille Bloquer à l’étape « modifier » (pièce, date, rappel) */
  onPreciser?: () => void;
  /** « Prévenu par téléphone », « Répondeur » (avis compris) */
  onPrevenu: (canal: CanalPrevenu) => Promise<void>;
  /** « Devis envoyé » pendant une attente d’accord (avis compris) */
  onDevisEnvoye: () => Promise<void>;
  onErreur: (message: string) => void;
};

/** Morceau affiché et sa forme parlée (lecteur d’écran). */
type Morceau = { texte: string; parle: string } | null | undefined | false;

function joindre(m: Morceau[]): { texte: string; parle: string } | null {
  const x = m.filter((v): v is { texte: string; parle: string } => Boolean(v));
  if (!x.length) return null;
  return { texte: x.map((v) => v.texte).join(' · '), parle: x.map((v) => v.parle).join(', ') };
}

const meme = (s: string): { texte: string; parle: string } => ({ texte: s, parle: s });

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « jeudi 29 octobre » */
const jourLong = (iso: string) => format(new Date(iso), 'EEEE d MMMM', { locale: fr });

/** Échéance : « jeu. 29 oct. », plus l’heure si elle est posée (« jeu. 29 oct. 14:00 »). */
function echeance(iso: string): { texte: string; parle: string } {
  const h = sansHeure(iso) ? '' : ` ${heure(iso)}`;
  return { texte: `${jourCourt(iso)}${h}`, parle: `${jourLong(iso)}${h ? ` à${h}` : ''}` };
}

/** « à 16:35 » le jour même, « le lun. 26 oct. à 16:35 » un autre jour. */
function aLHeure(iso: string, maintenant: Date): { texte: string; parle: string } {
  if (isSameDay(new Date(iso), maintenant)) return meme(`à ${heure(iso)}`);
  return { texte: `le ${jourCourt(iso)} à ${heure(iso)}`, parle: `le ${jourLong(iso)} à ${heure(iso)}` };
}

/** « 14:10 » le jour même, « lun. 26 oct. 14:10 » un autre jour. */
function moment(iso: string, maintenant: Date): { texte: string; parle: string } {
  if (isSameDay(new Date(iso), maintenant)) return meme(heure(iso));
  return { texte: `${jourCourt(iso)} ${heure(iso)}`, parle: `${jourLong(iso)} à ${heure(iso)}` };
}

/** Ce que dit le blocage, sans répéter son nom (déjà dans la pastille de l’en-tête). */
function ligneBlocage(i: Intervention, evenements: Evenement[], maintenant: Date, echu: boolean): { texte: string; parle: string } | null {
  const d = i.detailBlocage;
  const quoi = d?.quoi?.trim() ? meme(d.quoi.trim()) : null;
  const pose = bloqueeDepuis(i, evenements);
  // « 1 h 20 » ne se coupe pas entre le nombre et son unité.
  const depuisPose = pose && new Date(pose) <= maintenant ? { texte: depuisCourt(pose, maintenant).replace(/ /g, ' '), parle: depuisLong(pose, maintenant) } : null;
  // Échéance de la pièce ou heure du rappel dépassée (même règle que le repère de la carte).
  const retard = echu && meme('en retard');

  switch (i.blocage) {
    case 'attente_piece': {
      const pour = d?.pour ? echeance(d.pour) : null;
      const prevue = pour && { texte: `prévue ${pour.texte}`, parle: `prévue ${pour.parle}` };
      const signalee = !pour && depuisPose && { texte: `signalée depuis ${depuisPose.texte}`, parle: `signalée depuis ${depuisPose.parle}` };
      const l = joindre([quoi, prevue, retard, signalee]);
      if (!l) return meme('Pièce et date à préciser');
      return { texte: majuscule(l.texte), parle: `Attente pièce : ${l.parle}` };
    }
    case 'attente_accord': {
      const demande = depuisPose && { texte: `demandé depuis ${depuisPose.texte}`, parle: `demandé depuis ${depuisPose.parle}` };
      if (!quoi) return demande ? { texte: `Accord ${demande.texte}`, parle: `Accord ${demande.parle}` } : meme('Accord demandé');
      const l = joindre([quoi, demande]);
      return l && { texte: l.texte, parle: `Accord demandé : ${l.parle}` };
    }
    case 'rappeler_client': {
      const quand = d?.pour ? aLHeure(d.pour, maintenant) : null;
      const promis = quand && { texte: `rappel promis ${quand.texte}`, parle: `rappel promis ${quand.parle}` };
      const l = joindre([promis, quoi, retard, !promis && depuisPose && { texte: `depuis ${depuisPose.texte}`, parle: `depuis ${depuisPose.parle}` }]);
      return l && { texte: majuscule(l.texte), parle: `Client à rappeler : ${l.parle}` };
    }
    default:
      return null;
  }
}

/** Petit bouton secondaire du bandeau : 44 pt de haut, clair et sombre. */
function BoutonBandeau({ libelle, label, onPress }: { libelle: string; label: string; onPress: () => Promise<void> }) {
  const t = useTheme();
  const [occupe, setOccupe] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: occupe, disabled: occupe }}
      disabled={occupe}
      onPress={async () => {
        impulsion('leger');
        setOccupe(true);
        try {
          await onPress();
        } finally {
          setOccupe(false);
        }
      }}
      className="min-h-[44px] flex-1 flex-row items-center justify-center rounded-xl bg-surface2 px-3 active:opacity-70 dark:bg-surface2-dark">
      {occupe ? (
        <ActivityIndicator color={t.ink} />
      ) : (
        <Text maxFontSizeMultiplier={1.4} numberOfLines={1} adjustsFontSizeToFit className="text-[15px] font-semibold text-ink dark:text-ink-dark">
          {libelle}
        </Text>
      )}
    </Pressable>
  );
}

/** Une ligne du bandeau : icône et texte dans la couleur du ton, un lien à droite. */
function Rangee({
  icone,
  ton,
  texte,
  parle,
  droite,
  discret,
}: {
  icone: NomIcone;
  ton: Ton;
  texte: string;
  parle: string;
  droite?: ReactNode;
  /** Trace (devis parti, dernier accord) : plus petite que l’état en cours */
  discret?: boolean;
}) {
  const t = useTheme();
  return (
    <View className="min-h-[28px] flex-row items-center gap-2">
      <View accessible accessibilityLabel={parle} className="flex-1 flex-row items-center gap-2">
        <Icone nom={icone} taille={13} couleur={t[ton]} poids={icone === 'pause' ? 'bold' : 'medium'} />
        <Texte ton={ton} className={`flex-1 leading-[20px] ${discret ? 'text-[14px]' : 'text-[15px] font-semibold'}`}>
          {texte}
        </Texte>
      </View>
      {droite}
    </View>
  );
}

const LIBELLE_PRECISER: Record<string, string> = {
  attente_piece: 'Préciser la pièce et sa date',
  attente_accord: 'Préciser ce qui attend l’accord',
  rappeler_client: 'Préciser le rappel du client',
};

export function BandeauRepere({ intervention: i, evenements, membres, onPreciser, onPrevenu, onDevisEnvoye, onErreur }: Props) {
  const p = usePermissions();
  const maintenant = new Date();
  const prenom = (id: string | null | undefined) => (id ? (membres.find((m) => m.id === id)?.prenom ?? null) : null);

  async function proteger(geste: () => Promise<void>, echec: string) {
    try {
      await geste();
    } catch (e) {
      impulsion('erreur');
      onErreur((e as Error).message || echec);
    }
  }

  // ── Blocage : ce qu’on attend, pour quand
  const bloquee = estBloquee(i) && i.blocage !== 'client_sur_place';
  const tonBlocage: Ton = repereCarte(i, { maintenant, evenements })?.ton ?? 'warn';
  const blocage = bloquee ? ligneBlocage(i, evenements, maintenant, tonBlocage === 'danger') : null;
  const tonLigne: Ton = tonBlocage === 'danger' ? 'danger' : 'warn';

  // ── Devis (attente d’accord) : parti, ou à signaler avec « Voir les montants »
  const accordAttendu = bloquee && i.blocage === 'attente_accord';
  const devis = accordAttendu && i.devisEnvoyeLe ? aLHeure(i.devisEnvoyeLe, maintenant) : null;

  // ── Voiture prête : depuis quand, et qui a prévenu le client
  let prete: { texte: string; parle: string; ton: Ton; icone: NomIcone; boutons: boolean } | null = null;
  if (i.statut === 'termine') {
    // Une livraison annulée n’est ni un nouveau passage en Prêt ni un client à prévenir (domaine).
    const pret = preteDepuis(i, evenements);
    const pv = prevenuDe(i, evenements);
    if (!pv) {
      const depuis = pret ? moment(pret, maintenant) : null;
      prete = {
        texte: depuis ? `Prête depuis ${depuis.texte} · À prévenir` : 'Prête · À prévenir',
        parle: depuis ? `Prête depuis ${depuis.parle}, client à prévenir` : 'Prête, client à prévenir',
        ton: 'warn',
        icone: 'telephone',
        boutons: true,
      };
    } else {
      const quand = aLHeure(pv.le, maintenant);
      if (pv.canal === 'sms' && !pv.parRencar) {
        // « Écrire depuis mes SMS » (sans la prestation Relances SMS) : qui a écrit, et quand.
        const par = prenom(pv.par);
        prete = {
          texte: `Prévenu par SMS ${quand.texte}${par ? ` par ${par}` : ''}`,
          parle: `Client prévenu par SMS ${quand.parle}${par ? ` par ${par}` : ''}`,
          ton: 'ok',
          icone: 'message',
          boutons: false,
        };
      } else if (pv.canal === 'sms') {
        prete = {
          texte: `SMS envoyé ${quand.texte}`,
          parle: `SMS « prêt » envoyé ${quand.parle}`,
          ton: 'ok',
          icone: 'message',
          boutons: false,
        };
      } else if (pv.canal === 'appel') {
        const par = prenom(pv.par);
        prete = {
          texte: `Prévenu par téléphone ${quand.texte}${par ? ` par ${par}` : ''}`,
          parle: `Client prévenu par téléphone ${quand.parle}${par ? ` par ${par}` : ''}`,
          ton: 'ok',
          icone: 'valider',
          boutons: false,
        };
      } else {
        prete = {
          texte: `Répondeur ${quand.texte}, à rappeler`,
          parle: `Répondeur ${quand.parle}, client à rappeler`,
          ton: 'warn',
          icone: 'telephone',
          // Les deux boutons restent pour le rappel suivant.
          boutons: true,
        };
      }
    }
  }

  // ── Dernier accord : quand, comment ; montants avec « Voir les montants » seulement
  const a = i.dernierAccord;
  let accord: { texte: string; parle: string } | null = null;
  if (a) {
    const le = `${format(new Date(a.le), 'd MMM', { locale: fr })} à ${heure(a.le)}`;
    const leParle = `${format(new Date(a.le), 'd MMMM', { locale: fr })} à ${heure(a.le)}`;
    const canal = CANAUX_ACCORD[a.canal]?.phrase;
    const avant = a.montantAvant;
    const apres = a.montantApres;
    let montants: string | null = null;
    if (p.voirPrix && avant != null && apres != null && avant !== apres) montants = `${euros(avant)} → ${euros(apres)}`;
    else if (p.voirPrix && (apres ?? avant) != null) montants = euros(apres ?? avant);
    accord = montants
      ? { texte: `Accord du ${le} · ${montants}`, parle: `Accord ${dePrenom(a.de)} le ${leParle}${canal ? `, ${canal}` : ''}, ${montants.replace('→', 'puis')}` }
      : { texte: `Accord du ${le}${canal ? `, ${canal}` : ''}`, parle: `Accord ${dePrenom(a.de)} le ${leParle}${canal ? `, ${canal}` : ''}` };
  }

  if (!blocage && !prete && !accord) return null;

  const lienPreciser =
    onPreciser && i.blocage && LIBELLE_PRECISER[i.blocage] ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={LIBELLE_PRECISER[i.blocage]}
        onPress={() => {
          impulsion('leger');
          onPreciser();
        }}
        hitSlop={6}
        className="min-h-[44px] justify-center pl-2 active:opacity-60">
        <Texte ton="accent" className="text-[15px] font-semibold">
          Préciser
        </Texte>
      </Pressable>
    ) : undefined;

  return (
    <Carte className="mt-2.5 gap-1.5 px-4 py-2.5">
      {blocage ? (
        <Rangee icone={tonLigne === 'danger' ? 'alerte' : i.blocage === 'attente_piece' ? 'colis' : 'pause'} ton={tonLigne} texte={blocage.texte} parle={blocage.parle} droite={lienPreciser} />
      ) : null}

      {accordAttendu ? (
        devis ? (
          <Rangee discret icone="valider" ton="muted" texte={`Devis envoyé ${devis.texte}`} parle={`Devis envoyé au client ${devis.parle}`} />
        ) : p.voirPrix ? (
          <View className="flex-row items-center gap-3">
            <Texte ton="muted" className="flex-1 text-[15px]">
              Devis à envoyer
            </Texte>
            <View className="w-[150px] flex-row">
              <BoutonBandeau
                libelle="Devis envoyé"
                label="Noter que le devis est envoyé au client"
                onPress={() => proteger(onDevisEnvoye, 'Impossible de noter le devis.')}
              />
            </View>
          </View>
        ) : null
      ) : null}

      {prete ? (
        <>
          <Rangee icone={prete.icone} ton={prete.ton} texte={prete.texte} parle={prete.parle} />
          {prete.boutons ? (
            <View className="mb-0.5 mt-1 flex-row gap-2">
              <BoutonBandeau
                libelle="Prévenu par téléphone"
                label="Client prévenu par téléphone"
                onPress={() => proteger(() => onPrevenu('appel'), 'Impossible de noter l’appel.')}
              />
              <View className="w-[120px] flex-row">
                <BoutonBandeau
                  libelle="Répondeur"
                  label="Répondeur : client à rappeler"
                  onPress={() => proteger(() => onPrevenu('repondeur'), 'Impossible de noter le répondeur.')}
                />
              </View>
            </View>
          ) : null}
        </>
      ) : null}

      {accord ? <Rangee discret icone="valider" ton="muted" texte={accord.texte} parle={accord.parle} /> : null}
    </Carte>
  );
}
