/**
 * Fil « Suivi » de la fiche : qui a fait quoi et quand, et ce que lit le
 * client. Notes (auteur, photos, « Équipe » ou « Client ») et événements
 * (statut, blocage, accord, montant, devis, rendez-vous, retour prévu,
 * client prévenu, attribution, SMS) dans l’ordre du temps, triés par
 * (date, `RANG_EVENEMENT`) ; à instant égal, les notes viennent après.
 *
 * - Texte de chaque événement : `texteEvenement` du domaine ; horodatage
 *   absolu à droite de chaque ligne (« 11:05 », « hier 11:05 »,
 *   « lun. 26 oct. 11:05 »).
 * - Sous un événement visible du client : « Le client lit : « … » »
 *   (`phraseClientEvenement`, copie de la page de suivi). Un événement
 *   masqué par un retour arrière garde sa ligne d’équipe, sans « Le client
 *   lit ».
 * - La note automatique d’un événement (liée par `evenementId`) est
 *   fusionnée à sa ligne ; pour les lignes antérieures à la v2c,
 *   l’heuristique v2a est gardée (même auteur, phrase du statut, moins de
 *   5 s).
 * - Un accord et la levée qu’il produit (même instant) font une seule
 *   ligne : « Accord de Manon Lefèvre par téléphone, reçu par Adrien à
 *   11:05 », puis « Le client lit : « Accord bien reçu… » ».
 * - La trace du montant n’est rendue qu’avec `voirPrix` (le serveur ne la
 *   livre pas aux autres).
 * - Une note visible du client se retire de sa page pendant 10 minutes,
 *   par son auteur ou un gérant (P1) : lien « Retirer de la page client »
 *   sous la note, appui long ou action d’accessibilité, puis `FeuilleNote`.
 *   Une note retirée le dit : « Retirée de la page client par Elias à
 *   11:24 ».
 * - Un message écrit par le client sur sa page de suivi (« Répondre au
 *   garage », 0020) prend sa place dans le temps, sur fond bleu pâle, sous
 *   « Message du client » : jamais confondu avec une note de l’équipe. Tant
 *   que le dernier attend une réponse (aucune note visible de l’équipe
 *   après lui), il porte le geste suivant : « Répondre à Yassine », qui
 *   prépare une note visible client dans le compositeur.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View, type TextStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Carte, Icone, Legende, Texte, impulsion } from '@/components/ui';
import { messageARepondre } from '@/domain/messages-clients';
import { FENETRE_RETRAIT_NOTE_MIN, peutRetirerNote } from '@/domain/permissions';
import { RANG_EVENEMENT, STATUTS, phraseClientEvenement, texteEvenement } from '@/domain/statuts';
import type { Client, Commentaire, Evenement, Membre, MessageClient, Statut } from '@/domain/types';
import { dePrenom, heure, horodatageFil, jourCourt, memeJour } from '@/lib/format';
import { useDonnees, useMembre, usePermissions } from '@/state/session';
import { useTheme } from '@/theme/tokens';

import { Avis, useAvis, type ActionAvis } from './Avis';
import { FeuilleNote } from './FeuilleNote';
import { PhotosGrille } from './PhotosGrille';

type Props = {
  commentaires: Commentaire[];
  evenements: Evenement[];
  membres: Membre[];
  /** Client de l’intervention : le retrait nomme sa page (« Retirer cette note de la page de Hugo ? ») */
  client?: Client;
  /** Avis de la fiche (résultat d’un retrait) ; sans lui, l’avis s’affiche sous le fil */
  onAvis?: (texte: string, action?: ActionAvis) => void;
  /** Messages du client écrits sur sa page de suivi (0020) */
  messages?: MessageClient[];
  /** « Répondre à Yassine » : prépare une note visible client dans le compositeur */
  onRepondre?: () => void;
};

type LigneFil =
  | { cle: string; date: string; rang: number; type: 'note'; c: Commentaire }
  | { cle: string; date: string; rang: number; type: 'evenement'; e: Evenement; client: string | null }
  | { cle: string; date: string; rang: number; type: 'message'; m: MessageClient };

/** Écart au-delà duquel une note n’est plus l’écho automatique d’un statut (lignes antérieures à la v2c). */
const ECART_NOTE_AUTOMATIQUE_MS = 5000;
/** Un accord et sa levée sont écrits dans la même transaction : même instant. */
const ECART_ACCORD_MS = 1000;
/** Les notes passent après les événements du même instant. */
const RANG_NOTE = 100;
/** Un message du client passe après les notes du même instant. */
const RANG_MESSAGE = 200;
/** Heures alignées en colonne, à droite. */
const CHIFFRES: TextStyle = { fontVariant: ['tabular-nums'] };

const temps = (iso: string) => new Date(iso).getTime();

/**
 * Note automatique de chaque événement : celle qui lui est liée par
 * `evenementId` ; pour les lignes antérieures à la v2c, la note intacte
 * (sans photo, même auteur, texte exact de `STATUTS[statut].client`, à
 * moins de 5 s), visible du client ou masquée depuis par un retour arrière.
 * Une note retouchée ou écrite à la main reste une ligne à part.
 */
function notesAutomatiques(evenements: Evenement[], commentaires: Commentaire[]): Map<string, Commentaire> {
  const parEvenement = new Map<string, Commentaire>();
  const prises = new Set<string>();
  const ids = new Set(evenements.map((e) => e.id));
  for (const c of commentaires) {
    if (c.evenementId && ids.has(c.evenementId) && !parEvenement.has(c.evenementId)) {
      parEvenement.set(c.evenementId, c);
      prises.add(c.id);
    }
  }
  const masquees = new Set(evenements.flatMap((e) => e.details?.masques?.commentaires ?? []));
  for (const e of evenements) {
    if (e.type !== 'statut' || parEvenement.has(e.id)) continue;
    const s = e.valeur as Statut | null;
    const phrase = s && STATUTS[s] ? STATUTS[s].client : null;
    if (!phrase) continue;
    const quand = temps(e.creeLe);
    const note = commentaires.find(
      (c) =>
        !prises.has(c.id) &&
        !c.evenementId &&
        !c.retireeLe &&
        (c.visibleClient || masquees.has(c.id)) &&
        c.photos.length === 0 &&
        c.texte === phrase &&
        c.auteurId === e.membreId &&
        Math.abs(temps(c.creeLe) - quand) < ECART_NOTE_AUTOMATIQUE_MS,
    );
    if (note) {
      prises.add(note.id);
      parEvenement.set(e.id, note);
    }
  }
  return parEvenement;
}

/** Levée produite par chaque accord (même auteur, même instant) : les deux font une ligne. */
function leveesDesAccords(evenements: Evenement[]): Map<string, Evenement> {
  const parAccord = new Map<string, Evenement>();
  const prises = new Set<string>();
  for (const a of evenements) {
    if (a.type !== 'accord') continue;
    const levee = evenements.find(
      (x) =>
        !prises.has(x.id) &&
        x.type === 'blocage' &&
        x.valeur === null &&
        x.avant === 'attente_accord' &&
        x.membreId === a.membreId &&
        Math.abs(temps(x.creeLe) - temps(a.creeLe)) < ECART_ACCORD_MS,
    );
    if (levee) {
      prises.add(levee.id);
      parAccord.set(a.id, levee);
    }
  }
  return parAccord;
}

/**
 * Ce que lit le client pour un événement : rien s’il n’est pas (ou plus)
 * visible ; sinon la note automatique stockée, ou la phrase de la page.
 */
function ceQueLitLeClient(e: Evenement, note: Commentaire | undefined, maintenant: Date): string | null {
  if (e.visibleClient === false) return null;
  if (note) return note.visibleClient ? note.texte : null;
  return phraseClientEvenement(e, maintenant);
}

/** « à 11:24 », « hier à 11:24 », « le lun. 26 oct. à 11:24 » */
function momentRetrait(iso: string, maintenant: Date): string {
  const d = new Date(iso);
  if (memeJour(d, maintenant)) return `à ${heure(iso)}`;
  const veille = new Date(maintenant);
  veille.setDate(veille.getDate() - 1);
  if (memeJour(d, veille)) return `hier à ${heure(iso)}`;
  return `le ${jourCourt(iso)} à ${heure(iso)}`;
}

function LigneEvenement({ texte, date, client, maintenant }: { texte: string; date: string; client: string | null; maintenant: Date }) {
  const t = useTheme();
  const h = horodatageFil(date, maintenant);
  return (
    <View accessible className="pl-3" accessibilityLabel={`${texte}, ${h}${client ? `. Le client lit : ${client}` : ''}`}>
      <View className="flex-row items-start gap-3">
        <View className="mt-[6px] h-1.5 w-1.5 rounded-full bg-faint dark:bg-faint-dark" />
        <Legende className="flex-1">{texte}</Legende>
        <Legende style={CHIFFRES}>{h}</Legende>
      </View>
      {client ? (
        <View className="ml-[18px] mt-0.5 flex-row items-start gap-1.5">
          {/* Icône calée sur la première ligne quand la phrase en prend deux. */}
          <View className="mt-[3px]">
            <Icone nom="oeil" taille={12} couleur={t.ok} />
          </View>
          <Legende ton="ok" className="flex-1">
            {`Le client lit : « ${client} »`}
          </Legende>
        </View>
      ) : null}
    </View>
  );
}

type PropsMessage = {
  m: MessageClient;
  maintenant: Date;
  /** Prénom du client, pour « Répondre à Yassine » */
  prenom: string | null;
  /** Le message attend une réponse : le geste suivant est proposé dessous */
  onRepondre?: () => void;
};

/** Message écrit par le client sur sa page de suivi : fond bleu pâle, jamais confondu avec une note de l’équipe. */
function LigneMessage({ m, maintenant, prenom, onRepondre }: PropsMessage) {
  const t = useTheme();
  const h = horodatageFil(m.creeLe, maintenant);
  const libelleRepondre = prenom ? `Répondre à ${prenom}` : 'Répondre au client';
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <View className="rounded-2xl border border-accent-soft bg-accent-soft px-4 py-3 dark:border-accent-softdark dark:bg-accent-softdark">
        <View
          accessible
          accessibilityLabel={`Message du client${prenom ? ` ${prenom}` : ''}, ${h}, écrit sur sa page de suivi\u00a0: ${m.texte}`}>
          <View className="flex-row items-center gap-1.5">
            <Icone nom="message" taille={14} couleur={t.accent} />
            <Text maxFontSizeMultiplier={1.3} className="shrink text-[13px] font-semibold text-accent dark:text-accent-dark" numberOfLines={1}>
              Message du client
            </Text>
            <View className="flex-1" />
            <Legende style={CHIFFRES}>{h}</Legende>
          </View>
          <Texte className="mt-1">{m.texte}</Texte>
        </View>
        {onRepondre ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={libelleRepondre}
            accessibilityHint="Prépare une note visible sur la page de suivi du client"
            onPress={() => {
              impulsion('leger');
              onRepondre();
            }}
            className="-mb-2 mt-0.5 min-h-[44px] flex-row items-center gap-1.5 self-start active:opacity-60">
            <Icone nom="oeil" taille={14} couleur={t.accent} />
            <Text maxFontSizeMultiplier={1.5} className="text-[15px] font-semibold text-accent dark:text-accent-dark">
              {libelleRepondre}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

type PropsNote = {
  c: Commentaire;
  maintenant: Date;
  /** Prénom du membre qui a retiré la note de la page du client */
  retireePar: string | null;
  /** Le membre peut encore la retirer de la page du client (P1) */
  retirable: boolean;
  onRetirer: () => void;
};

function LigneNote({ c, maintenant, retireePar, retirable, onRetirer }: PropsNote) {
  const t = useTheme();
  const pourClient = c.visibleClient;
  const h = horodatageFil(c.creeLe, maintenant);
  // Libellés distincts de ceux du compositeur (« Réservée à l’équipe », « Visible par le client ») : VoiceOver ne les confond plus.
  const etiquette = pourClient ? 'Note visible du client' : 'Note réservée à l’équipe';
  const retrait = c.retireeLe
    ? `Retirée de la page client${retireePar ? ` par ${retireePar}` : ''} ${momentRetrait(c.retireeLe, maintenant)}`
    : null;
  const libelle = `${c.auteurNom}, ${h}, ${etiquette}${c.texte ? ` : ${c.texte}` : ''}${retrait ? `. ${retrait}` : ''}`;

  const contenu: ReactNode = (
    <>
      <View className="flex-row items-center gap-2">
        <Legende className="shrink font-semibold" numberOfLines={1}>
          {c.auteurNom}
        </Legende>
        <View className="flex-row items-center gap-1" accessibilityLabel={etiquette}>
          <Icone nom={pourClient ? 'oeil' : 'cadenas'} taille={13} couleur={pourClient ? t.ok : t.muted} />
          <Text
            maxFontSizeMultiplier={1.3}
            className={`text-[13px] font-semibold ${pourClient ? 'text-ok dark:text-ok-dark' : 'text-muted dark:text-muted-dark'}`}>
            {pourClient ? 'Client' : 'Équipe'}
          </Text>
        </View>
        <View className="flex-1" />
        <Legende style={CHIFFRES}>{h}</Legende>
      </View>
      {c.texte ? <Texte className="mt-1">{c.texte}</Texte> : null}
      {retrait ? <Legende className="mt-1">{retrait}</Legende> : null}
    </>
  );

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Carte className="px-4 py-3">
        {retirable ? (
          // Appui long et action d’accessibilité : même effet que le lien sous la note.
          <Pressable
            accessibilityLabel={libelle}
            accessibilityActions={[{ name: 'retirer', label: 'Retirer de la page client' }]}
            onAccessibilityAction={(ev) => {
              if (ev.nativeEvent.actionName === 'retirer') onRetirer();
            }}
            delayLongPress={450}
            onLongPress={() => {
              impulsion('moyen');
              onRetirer();
            }}>
            {contenu}
          </Pressable>
        ) : (
          <View accessible accessibilityLabel={libelle}>
            {contenu}
          </View>
        )}
        <PhotosGrille photos={c.photos} />
        {retirable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retirer de la page client"
            accessibilityHint={`Note ${dePrenom(c.auteurNom)}, ${h}`}
            onPress={() => {
              impulsion('leger');
              onRetirer();
            }}
            className="-mb-2 mt-0.5 min-h-[44px] flex-row items-center gap-1.5 self-start active:opacity-60">
            <Icone nom="annuler" taille={14} couleur={t.accent} />
            <Text maxFontSizeMultiplier={1.5} className="text-[15px] font-semibold text-accent dark:text-accent-dark">
              Retirer de la page client
            </Text>
          </Pressable>
        ) : null}
      </Carte>
    </Animated.View>
  );
}

export function FilSuivi({ commentaires, evenements, membres, client, onAvis, messages = [], onRepondre }: Props) {
  const membre = useMembre();
  const { voirPrix } = usePermissions();
  const interventionId = evenements[0]?.interventionId ?? commentaires[0]?.interventionId ?? messages[0]?.interventionId;
  // Prénom du client : la feuille et l’avis nomment sa page.
  const prenomDonnees = useDonnees((s) => {
    const i = interventionId ? s.interventions.find((x) => x.id === interventionId) : undefined;
    return (i && s.clients.find((k) => k.id === i.clientId)?.prenom) || null;
  });
  const prenomClient = client?.prenom || prenomDonnees;

  // Horloge du fil : relue quand la fenêtre de retrait d’une note se ferme (le lien disparaît).
  const [maintenant, setMaintenant] = useState(() => new Date());
  const [avisLocal, montrerAvisLocal] = useAvis();
  const avis = onAvis ?? montrerAvisLocal;
  const [aRetirer, setARetirer] = useState<Commentaire | null>(null);
  const [feuilleOuverte, setFeuilleOuverte] = useState(false);

  const fenetreMs = FENETRE_RETRAIT_NOTE_MIN * 60_000;
  const retirables = new Set(commentaires.filter((c) => peutRetirerNote(membre, c, maintenant)).map((c) => c.id));
  const prochaineFin = commentaires.reduce(
    (min, c) => (retirables.has(c.id) ? Math.min(min, temps(c.creeLe) + fenetreMs) : min),
    Number.POSITIVE_INFINITY,
  );

  useEffect(() => {
    if (!Number.isFinite(prochaineFin)) return undefined;
    const minuterie = setTimeout(() => setMaintenant(new Date()), Math.max(0, prochaineFin - Date.now()) + 250);
    return () => {
      clearTimeout(minuterie);
    };
  }, [prochaineFin]);

  const automatiques = notesAutomatiques(evenements, commentaires);
  const absorbees = new Set([...automatiques.values()].map((c) => c.id));
  const leveesAccord = leveesDesAccords(evenements);
  const fusionnees = new Set([...leveesAccord.values()].map((e) => e.id));
  const prenomDe = (id?: string | null) => (id ? (membres.find((m) => m.id === id)?.prenom ?? null) : null);

  const lignes: LigneFil[] = [];
  for (const e of evenements) {
    if (fusionnees.has(e.id)) continue;
    // D2 : la trace du montant n’atteint pas un membre sans « Voir les montants ».
    if (e.type === 'montant' && !voirPrix) continue;
    const levee = leveesAccord.get(e.id);
    const lit = levee ? ceQueLitLeClient(levee, undefined, maintenant) : ceQueLitLeClient(e, automatiques.get(e.id), maintenant);
    lignes.push({ cle: `e-${e.id}`, date: e.creeLe, rang: RANG_EVENEMENT[e.type] ?? RANG_NOTE - 1, type: 'evenement', e, client: lit });
  }
  for (const c of commentaires) {
    if (!absorbees.has(c.id)) lignes.push({ cle: `k-${c.id}`, date: c.creeLe, rang: RANG_NOTE, type: 'note', c });
  }
  for (const m of messages) lignes.push({ cle: `m-${m.id}`, date: m.creeLe, rang: RANG_MESSAGE, type: 'message', m });
  lignes.sort((a, b) => temps(a.date) - temps(b.date) || a.rang - b.rang);
  // Geste suivant : seulement sous le dernier message, tant qu’aucune note visible de l’équipe ne l’a suivi.
  const aRepondre = interventionId ? messageARepondre(messages, commentaires, interventionId) : null;

  if (lignes.length === 0) {
    return null;
  }

  return (
    <View className="gap-2">
      {lignes.map((x) =>
        x.type === 'message' ? (
          <LigneMessage
            key={x.cle}
            m={x.m}
            maintenant={maintenant}
            prenom={prenomClient}
            onRepondre={onRepondre && aRepondre?.id === x.m.id ? onRepondre : undefined}
          />
        ) : x.type === 'note' ? (
          <LigneNote
            key={x.cle}
            c={x.c}
            maintenant={maintenant}
            retireePar={x.c.retireeLe ? prenomDe(x.c.retireePar) : null}
            retirable={retirables.has(x.c.id)}
            onRetirer={() => {
              setARetirer(x.c);
              setFeuilleOuverte(true);
            }}
          />
        ) : (
          <LigneEvenement
            key={x.cle}
            texte={texteEvenement(x.e, membres, { voirPrix })}
            date={x.e.creeLe}
            client={x.client}
            maintenant={maintenant}
          />
        ),
      )}
      {onAvis ? null : <Avis texte={avisLocal} />}
      <FeuilleNote
        note={aRetirer}
        ouverte={feuilleOuverte}
        onFermer={() => setFeuilleOuverte(false)}
        prenomClient={prenomClient}
        onAvis={avis}
      />
    </View>
  );
}
