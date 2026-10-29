/**
 * « Qu’est-ce qui bloque ? » (v2c, E4) : bloquer en deux appuis, préciser
 * sans phrase libre. Trois étapes dans la même feuille :
 * - « type » (carré Bloquer) : un appui pose le blocage (`onPoser`), puis
 *   l’étape « préciser » s’affiche, inerte `GARDE_MS` (le second appui d’un
 *   double appui ne remplit rien). Fermer la feuille garde le blocage sans
 *   détail : deux appuis en tout (R-3 de L05 corrigé) ;
 * - « préciser » (juste après la pose) : quoi, pour quand, annonce au
 *   client, devis ; « Annuler le signalement » (J14, 30 s) tant que rien
 *   n’est précisé ;
 * - « modifier » (lien « Préciser » ou carré de la barre sur une fiche
 *   bloquée) : champs préremplis, report de la pièce, « Lever l’attente »
 *   (`onLever`, qui ouvre la feuille Accord pour une attente d’accord).
 *
 * Repris de la feuille Bloquer de la v2b, corrigé : le choix du type pose
 * le blocage tout de suite (v2b demandait un 3ᵉ appui), une heure se
 * précise pour la pièce, « Client sur place » n’est plus proposé, et les
 * écritures passent par le crochet de passage (`usePassageStatut`) :
 * événements, phrase client et notifications sont produits par la base.
 * Rien ici n’écrit de texte libre dans le fil.
 */

import { addDays, addMinutes, setHours, setMinutes, startOfDay } from 'date-fns';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { plageDuJour } from '@/components/nouvelle-intervention/creneaux';
import {
  Bouton,
  Champ,
  ENTREE_FEUILLE_MS,
  Erreur,
  Feuille,
  FeuilleDate,
  GARDE_MS,
  Groupe,
  Icone,
  Legende,
  Ligne,
  PucesHeures,
  PucesJours,
  Texte,
  impulsion,
  libelleJourPuce,
  type NomIcone,
} from '@/components/ui';
import { heuresDuJour, heuresProposees, joursOuvres } from '@/domain/echeances';
import { FENETRE_ANNULATION_S } from '@/domain/journal';
import { PHRASE_DEVIS, POSES_BLOCAGE, QUOI_MAX } from '@/domain/statuts';
import type { Blocage, Client, DetailBlocage, Garage, Intervention, Vehicule } from '@/domain/types';
import { heure, jourCourt, jourHeure, jourLongClient, memeJour, sansHeure, titreVoiture } from '@/lib/format';
import { usePermissions } from '@/state/session';
import { useTheme } from '@/theme/tokens';

export type EtapeBlocage = 'type' | 'preciser' | 'modifier';

export type PropsFeuilleBlocage = {
  cible: { intervention: Intervention; client?: Client; vehicule?: Vehicule; etape: EtapeBlocage } | null;
  horaires: Garage['horaires'];
  onFermer: () => void;
  /** Étape « type » : pose le blocage tout de suite (2 appuis), puis l’étape « préciser » s’affiche */
  onPoser: (b: Blocage) => Promise<void>;
  onPreciser: (d: DetailBlocage, o: { devisEnvoye?: boolean }) => Promise<void>;
  /** Étape « préciser » juste après la pose : « Annuler le signalement » (J14) */
  onAnnulerPose: () => Promise<void>;
  /** Étape « modifier » : « Lever l’attente » (passe par executer ; accord : feuille Accord) */
  onLever: () => void;
};

/** Question du « quoi » selon le blocage (60 caractères, interne à l’équipe). */
const QUESTION: Record<Blocage, { libelle: string; exemple: string } | null> = {
  attente_piece: { libelle: 'Quelle pièce ?', exemple: 'Ex. sonde lambda' },
  attente_accord: { libelle: 'Sur quoi ?', exemple: 'Ex. plaquettes avant' },
  rappeler_client: { libelle: 'Pourquoi ?', exemple: 'Ex. devis à confirmer' },
  // Plus proposé à la pose (v2c) : une ancienne fiche ne fait que se lever.
  client_sur_place: null,
};

/** Titre de l’étape « modifier ». */
const TITRE_MODIFIER: Record<Blocage, string> = {
  attente_piece: 'Attente pièce',
  attente_accord: 'Attente d’accord',
  rappeler_client: 'Rappel',
  client_sur_place: 'Client sur place',
};

/** Ce que lève « Lever l’attente », dit au lecteur d’écran. */
const LEVEE_PARLEE: Record<Blocage, string> = {
  attente_piece: 'Lever l’attente : pièce reçue',
  attente_accord: 'Lever l’attente : noter l’accord du client',
  rappeler_client: 'Lever l’attente : client rappelé',
  client_sur_place: 'Lever l’attente',
};

const ICONES: Partial<Record<Blocage, NomIcone>> = {
  attente_piece: 'colis',
  attente_accord: 'euro',
  rappeler_client: 'telephone',
};

const aHeure = (jour: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return setMinutes(setHours(startOfDay(jour), Number.isFinite(h) ? h : 0), Number.isFinite(m) ? m : 0);
};

const memeInstant = (a?: string | null, b?: string | null) => (a && b ? new Date(a).getTime() === new Date(b).getTime() : !a && !b);

/** L’heure « 09:00 » tombe dans les heures d’ouverture de ce jour, et n’est pas passée. */
function heureTient(horaires: Garage['horaires'], jour: Date, hhmm: string, maintenant: Date): boolean {
  const plage = plageDuJour(horaires, jour);
  if (!plage || hhmm < plage.de || hhmm > plage.a) return false;
  return !memeJour(jour, maintenant) || aHeure(jour, hhmm) > maintenant;
}

const majusculeInitiale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Nombre de jours ouvrés proposés en puces pour la pièce (aujourd’hui compris), avant « Autre date… ». */
const JOURS_PIECE = 5;

/** Un moment de rappel proposé : libellé de puce et échéance. */
type Moment = { libelle: string; iso: string };

/**
 * « Quand ? » du rappel : dans une heure (arrondie aux 5 minutes), les
 * heures libres du jour, puis l’ouverture du prochain jour ouvré (« Demain
 * matin »). Un rappel déjà promis à un autre moment reste proposé, en tête.
 */
function momentsRappel(horaires: Garage['horaires'], maintenant: Date, actuel?: string): Moment[] {
  const liste: Moment[] = [];
  const dansUneHeure = addMinutes(maintenant, 60);
  const arrondi = addMinutes(dansUneHeure, (5 - (dansUneHeure.getMinutes() % 5)) % 5);
  arrondi.setSeconds(0, 0);
  liste.push({ libelle: 'Dans 1 h', iso: arrondi.toISOString() });
  for (const h of heuresProposees(horaires, maintenant, maintenant)) {
    liste.push({ libelle: h, iso: aHeure(maintenant, h).toISOString() });
  }
  const suivant = joursOuvres(horaires, addDays(startOfDay(maintenant), 1), 1)[0];
  const plage = suivant ? plageDuJour(horaires, suivant) : null;
  if (suivant && plage) {
    liste.push({ libelle: `${majusculeInitiale(libelleJourPuce(suivant))} matin`, iso: aHeure(suivant, plage.de).toISOString() });
  }
  if (actuel && !liste.some((m) => memeInstant(m.iso, actuel))) {
    const libelle = sansHeure(actuel) ? jourCourt(actuel) : memeJour(new Date(actuel), maintenant) ? heure(actuel) : jourHeure(actuel);
    liste.unshift({ libelle, iso: actuel });
  }
  return liste;
}

/** « à 09:47 » le jour même, « le lun. 26 oct. à 09:47 » sinon. */
function moment(iso: string, maintenant: Date): string {
  return memeJour(new Date(iso), maintenant) ? `à ${heure(iso)}` : `le ${jourCourt(iso)} à ${heure(iso)}`;
}

export function FeuilleBlocage({ cible, horaires, onFermer, onPoser, onPreciser, onAnnulerPose, onLever }: PropsFeuilleBlocage): ReactElement {
  const i = cible?.intervention ?? null;
  const etape: EtapeBlocage = cible?.etape ?? 'type';
  const b = i?.blocage ?? null;
  const titre = etape === 'type' ? 'Qu’est-ce qui bloque ?' : etape === 'preciser' ? 'Préciser l’attente (facultatif)' : b ? TITRE_MODIFIER[b] : 'Blocage';

  return (
    <Feuille
      ouverte={cible !== null}
      onFermer={onFermer}
      titre={titre}
      legende={i ? titreVoiture(cible?.vehicule) : undefined}
      // Étape « préciser » : ouverte par un geste (la pose), inerte comme la garde.
      inerteMs={etape === 'preciser' ? GARDE_MS : ENTREE_FEUILLE_MS}
      cleInertie={etape}>
      {!i ? null : etape === 'type' ? (
        <ChoixType key={`${i.id}-type`} onPoser={onPoser} />
      ) : b ? (
        <Precision
          // Chaque ouverture, chaque étape et chaque blocage repartent de la donnée enregistrée.
          key={`${i.id}-${etape}-${b}`}
          intervention={i}
          blocage={b}
          etape={etape}
          horaires={horaires}
          onFermer={onFermer}
          onPreciser={onPreciser}
          onAnnulerPose={onAnnulerPose}
          onLever={onLever}
        />
      ) : (
        <Legende className="mb-2 ml-1">Cette voiture n’est plus bloquée.</Legende>
      )}
    </Feuille>
  );
}

// ───────────────────────────────────────────── Étape « type »

/**
 * Ligne d’interrupteur touchable sur toute sa hauteur (52 pt) : libellé et
 * état lus ensemble par VoiceOver, et un appui n’importe où sur la ligne
 * bascule (l’interrupteur natif seul ferait une cible de 31 pt).
 */
function LigneBascule({ titre, aide, valeur, onChange }: { titre: string; aide?: string; valeur: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={titre}
      accessibilityHint={aide}
      accessibilityState={{ checked: valeur }}
      onPress={() => {
        impulsion('leger');
        onChange(!valeur);
      }}
      className="min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:bg-surface2 dark:active:bg-surface2-dark">
      <View className="flex-1">
        <Texte className="text-[15px] leading-[20px]">{titre}</Texte>
        {aide ? <Legende className="mt-0.5">{aide}</Legende> : null}
      </View>
      {/* L’appui va à la ligne : l’interrupteur ne fait que montrer l’état. */}
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch
          value={valeur}
          trackColor={{ true: t.accentFond, false: t.line }}
          thumbColor={t.blanc}
          {...({ activeThumbColor: t.blanc } as object)}
          ios_backgroundColor={t.line}
        />
      </View>
    </Pressable>
  );
}

function ChoixType({ onPoser }: { onPoser: (b: Blocage) => Promise<void> }) {
  const t = useTheme();
  /** Un seul blocage par ouverture : le second appui d’un double appui ne pose rien de plus. */
  const enCours = useRef(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function poser(b: Blocage) {
    if (enCours.current) return;
    enCours.current = true;
    setErreur(null);
    try {
      await onPoser(b);
    } catch (e) {
      enCours.current = false;
      setErreur((e as Error).message || 'Impossible de signaler le blocage.');
    }
  }

  return (
    <View>
      <Groupe className="mb-2">
        {POSES_BLOCAGE.map((p, k) => (
          <Ligne
            key={p.blocage}
            derniere={k === POSES_BLOCAGE.length - 1}
            onPress={() => void poser(p.blocage)}
            accessibilityLabel={`Signaler : ${p.label}`}>
            <Icone nom={ICONES[p.blocage] ?? 'pause'} taille={18} couleur={t.warn} />
            <Texte className="flex-1">{p.label}</Texte>
          </Ligne>
        ))}
      </Groupe>
      {erreur ? (
        <Erreur className="mb-2 ml-1">{erreur}</Erreur>
      ) : (
        <Legende className="mb-2 ml-1">Un appui suffit pour signaler. Préciser ensuite reste facultatif.</Legende>
      )}
    </View>
  );
}

// ───────────────────────────────────────────── Étapes « préciser » et « modifier »

type PropsPrecision = {
  intervention: Intervention;
  blocage: Blocage;
  etape: 'preciser' | 'modifier';
  horaires: Garage['horaires'];
  onFermer: () => void;
  onPreciser: PropsFeuilleBlocage['onPreciser'];
  onAnnulerPose: PropsFeuilleBlocage['onAnnulerPose'];
  onLever: () => void;
};

function Precision({ intervention: i, blocage: b, etape, horaires, onFermer, onPreciser, onAnnulerPose, onLever }: PropsPrecision) {
  const p = usePermissions();
  const insets = useSafeAreaInsets();
  const [maintenant] = useState(() => new Date());
  const detail = i.detailBlocage;
  const question = QUESTION[b];
  const pourActuel = detail?.pour;

  const [quoi, setQuoi] = useState(detail?.quoi ?? '');
  // Pièce : un jour (minuit) et une heure facultative.
  const [jour, setJour] = useState<Date | null>(() => (b === 'attente_piece' && pourActuel ? startOfDay(new Date(pourActuel)) : null));
  const [heurePiece, setHeurePiece] = useState<string | null>(() =>
    b === 'attente_piece' && pourActuel && !sansHeure(pourActuel) ? heure(pourActuel) : null,
  );
  const [annonce, setAnnonce] = useState(Boolean(detail?.annonce && pourActuel));
  // Rappel : un moment parmi ceux proposés (libellé de puce), ou sans heure.
  const moments = useMemo(
    () => (b === 'rappeler_client' ? momentsRappel(horaires, maintenant, pourActuel) : []),
    [b, horaires, maintenant, pourActuel],
  );
  // « Autre heure… » : les autres heures pleines d’aujourd’hui (un rappel promis à 15:00).
  const autresRappel = useMemo<Moment[]>(
    () =>
      b === 'rappeler_client'
        ? heuresDuJour(horaires, maintenant, maintenant)
            .filter((h) => !moments.some((m) => m.libelle === h))
            .map((h) => ({ libelle: h, iso: aHeure(maintenant, h).toISOString() }))
        : [],
    [b, horaires, maintenant, moments],
  );
  const [rappel, setRappel] = useState<string | null>(() => moments.find((m) => memeInstant(m.iso, pourActuel))?.libelle ?? null);
  // Accord : devis transmis au client (seulement avec « Voir les montants »).
  const [devis, setDevis] = useState(false);

  const [dateOuverte, setDateOuverte] = useState(false);
  const [annulable, setAnnulable] = useState(etape === 'preciser');
  const [annulation, setAnnulation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // « Annuler le signalement » suit la marge du serveur (30 s après la pose), puis disparaît.
  useEffect(() => {
    if (etape !== 'preciser') return undefined;
    const minuterie = setTimeout(() => setAnnulable(false), FENETRE_ANNULATION_S * 1000);
    return () => {
      clearTimeout(minuterie);
    };
  }, [etape]);

  // Le clavier (quoi) ne masque pas le bouton : la feuille s’allonge de sa hauteur.
  const { height: clavier } = useReanimatedKeyboardAnimation();
  const sousClavier = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, -clavier.value - insets.bottom) }));

  const joursPiece = useMemo(() => joursOuvres(horaires, maintenant, JOURS_PIECE), [horaires, maintenant]);
  const heuresPiece = useMemo(() => (jour ? heuresProposees(horaires, jour, maintenant) : []), [horaires, jour, maintenant]);
  const autresPiece = useMemo(() => (jour ? heuresDuJour(horaires, jour, maintenant) : []), [horaires, jour, maintenant]);

  const pourPiece = jour ? (heurePiece ? aHeure(jour, heurePiece) : startOfDay(jour)).toISOString() : undefined;
  const pourRappel = rappel ? [...moments, ...autresRappel].find((m) => m.libelle === rappel)?.iso : undefined;
  const pour = b === 'attente_piece' ? pourPiece : b === 'rappeler_client' ? pourRappel : pourActuel;

  // Le détail tel qu’il sera enregistré (normalisé comme le serveur).
  const q = quoi.trim().slice(0, QUOI_MAX);
  const nouveau: DetailBlocage = {};
  if (q) nouveau.quoi = q;
  if (pour) nouveau.pour = pour;
  if (b === 'attente_piece' && pour && annonce) nouveau.annonce = true;
  const detailChange =
    (nouveau.quoi ?? '') !== (detail?.quoi ?? '') ||
    !memeInstant(nouveau.pour, pourActuel) ||
    Boolean(nouveau.annonce) !== Boolean(detail?.annonce && pourActuel);
  const devisPossible = b === 'attente_accord' && p.voirPrix && !i.devisEnvoyeLe;
  const devisEnvoye = devisPossible && devis;
  const aEnregistrer = detailChange || devisEnvoye;

  function choisirJour(d: Date | null) {
    setJour(d);
    if (!d) {
      setHeurePiece(null);
      setAnnonce(false);
      return;
    }
    // L’heure choisie suit si le garage est ouvert à cette heure-là ce jour-là (et qu’elle n’est pas passée).
    if (heurePiece && !heureTient(horaires, d, heurePiece, maintenant)) setHeurePiece(null);
  }

  async function enregistrer() {
    setErreur(null);
    try {
      await onPreciser(nouveau, devisEnvoye ? { devisEnvoye: true } : {});
    } catch (e) {
      setErreur((e as Error).message || 'Impossible d’enregistrer la précision.');
    }
  }

  async function annulerPose() {
    if (annulation) return;
    setAnnulation(true);
    setErreur(null);
    try {
      await onAnnulerPose();
    } catch (e) {
      // Trop tard (30 s) ou déjà modifié : le lien disparaît, le blocage reste.
      setAnnulable(false);
      setErreur((e as Error).message || 'Impossible d’annuler le signalement.');
    } finally {
      setAnnulation(false);
    }
  }

  return (
    <>
      <Animated.View style={sousClavier} className="shrink">
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
          {b === 'rappeler_client' ? (
            <View className="mb-4">
              <Legende accessibilityRole="header" className="mb-1.5 ml-1 font-medium">
                Quand ?
              </Legende>
              <PucesHeures heures={moments.map((m) => m.libelle)} autres={autresRappel.map((m) => m.libelle)} valeur={rappel} onChoisir={setRappel} sansHeure />
            </View>
          ) : null}

          {question ? (
            <Champ
              className="mb-0"
              libelle={question.libelle}
              value={quoi}
              onChangeText={(v) => setQuoi(v.slice(0, QUOI_MAX))}
              maxLength={QUOI_MAX}
              placeholder={question.exemple}
              returnKeyType="done"
            />
          ) : (
            <Legende className="ml-1">Rien à préciser pour ce blocage.</Legende>
          )}

          {b === 'attente_piece' ? (
            <View className="mt-4">
              <Legende accessibilityRole="header" className="mb-1.5 ml-1 font-medium">
                Pour quand ?
              </Legende>
              <PucesJours
                jours={joursPiece}
                valeur={jour}
                // Un second appui sur le jour choisi retire la date.
                onChoisir={(d) => choisirJour(jour && memeJour(d, jour) ? null : d)}
                autreDate={() => setDateOuverte(true)}
              />
              {jour ? (
                <>
                  <View className="mt-3">
                    <Legende accessibilityRole="header" className="mb-1.5 ml-1 font-medium">
                      Heure
                    </Legende>
                    <PucesHeures heures={heuresPiece} autres={autresPiece} valeur={heurePiece} onChoisir={setHeurePiece} sansHeure />
                  </View>
                  <Groupe className="mb-0 mt-4">
                    <LigneBascule
                      titre={`Dire au client : « Pièce attendue le ${jourLongClient(pourPiece ?? jour.toISOString(), maintenant)} »`}
                      valeur={annonce}
                      onChange={setAnnonce}
                    />
                  </Groupe>
                  <Legende className="ml-1 mt-2">
                    {annonce ? 'Le client lira la date sur sa page de suivi, jamais l’heure.' : 'La date reste visible de l’équipe seulement.'}
                  </Legende>
                </>
              ) : null}
            </View>
          ) : null}

          {b === 'attente_accord' && p.voirPrix ? (
            i.devisEnvoyeLe ? (
              <Legende className="ml-1 mt-4">{`Devis envoyé ${moment(i.devisEnvoyeLe, maintenant)}.`}</Legende>
            ) : (
              <Groupe className="mb-0 mt-4">
                <LigneBascule
                  titre="Devis déjà envoyé au client"
                  aide={`Le client lira « ${PHRASE_DEVIS} »`}
                  valeur={devis}
                  onChange={setDevis}
                />
              </Groupe>
            )
          ) : null}
          <View className="h-1" />
        </ScrollView>

        {/* Sous le pouce : le geste, puis les sorties. */}
        <View className="mt-4 gap-2">
          {question || devisPossible ? (
            <Bouton onPress={enregistrer} desactive={!aEnregistrer} accessibilityLabel="Enregistrer la précision">
              Enregistrer
            </Bouton>
          ) : null}
          {etape === 'preciser' ? (
            <Bouton variante="secondaire" onPress={onFermer}>
              Plus tard
            </Bouton>
          ) : null}
        </View>
        {erreur ? <Erreur className="ml-1 mt-2">{erreur}</Erreur> : null}
        {etape === 'preciser' && annulable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Annuler le signalement"
            accessibilityState={{ busy: annulation }}
            disabled={annulation}
            onPress={() => void annulerPose()}
            className="mt-2 min-h-[44px] items-center justify-center rounded-xl active:opacity-60">
            <Texte ton="danger" className="font-semibold">
              Annuler le signalement
            </Texte>
          </Pressable>
        ) : null}
        {etape === 'modifier' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={LEVEE_PARLEE[b]}
            onPress={onLever}
            className="mt-2 min-h-[44px] items-center justify-center rounded-xl active:opacity-60">
            <Texte ton="accent" className="font-semibold">
              Lever l’attente
            </Texte>
          </Pressable>
        ) : null}
      </Animated.View>

      {/* Au-delà des puces : la grille du mois, rendue dans cette feuille (une fenêtre modale à la fois sur iOS). */}
      {b === 'attente_piece' ? (
        <FeuilleDate
          ouverte={dateOuverte}
          onFermer={() => setDateOuverte(false)}
          titre="Pièce attendue le…"
          horaires={horaires}
          valeur={jour}
          min={startOfDay(maintenant)}
          onChoisir={(d) => {
            choisirJour(d);
            setDateOuverte(false);
          }}
        />
      ) : null}
    </>
  );
}
