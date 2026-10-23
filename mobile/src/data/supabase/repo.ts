/**
 * Implémentation Supabase du contrat Repo.
 *
 * Schéma, policies RLS et fonctions SQL : `supabase/migrations/` à la racine
 * du dépôt (README dans `supabase/`). Principes :
 *   - lecture du garage entier (quelques Mo au plus) par `charger()`, avec
 *     pagination par 1 000 lignes ; les interventions passent par la vue
 *     `interventions_visibles` (montant masqué sans la permission voirPrix) ;
 *   - temps réel : un canal Realtime `postgres_changes` filtré sur le garage,
 *     qui recharge (debounce 300 ms) et notifie les abonnés ;
 *   - chaque mutation recharge avant de rendre la main, pour que l’écran
 *     trouve la donnée à jour dans le store ;
 *   - l’auteur d’une action est toujours l’utilisateur connecté (auth.uid()),
 *     le journal (évènements, commentaire d’étape) est écrit par des triggers ;
 *   - les insertions portent un identifiant généré ici et se font sans
 *     RETURNING : PostgreSQL soumet un RETURNING à la policy de lecture, qu’un
 *     employé sans voirTout ne satisfait pas toujours (fiche non attribuée) ;
 *   - les fonctions Edge (sms, inviter) sont la source de vérité de ce qu’elles
 *     font ; leurs refus remontent à l’écran ; absente, « inviter » laisse
 *     l’invitation en attente, « sms » signale que rien n’est parti ;
 *   - les photos vont dans le bucket privé « photos », lues par URL signées ;
 *   - présence pour la console Rencar : `signaler_presence` à l’ouverture de
 *     session et au retour au premier plan (au plus toutes les 10 minutes),
 *     sans jamais bloquer ni faire échouer l’app.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createClient,
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import type { Consultations, Identifiants, NouveauMembre, NouvelleIntervention, Repo, Snapshot } from '@/data/repo';
import { peut, POSTES, TOUTES_PERMISSIONS } from '@/domain/permissions';
import type { Blocage, Client, Commentaire, Intervention, Membre, Session, Statut, Vehicule } from '@/domain/types';

import {
  compacter,
  patchClientVersLigne,
  patchGarageVersLigne,
  patchInterventionVersLigne,
  patchMembreVersLigne,
  patchVehiculeVersLigne,
  versAppel,
  versClient,
  versCommentaire,
  versEvenement,
  versGarage,
  versIntervention,
  versMembre,
  versMembreDepuisInvitation,
  versNotification,
  versVehicule,
  type LigneAppel,
  type LigneClient,
  type LigneCommentaire,
  type LigneEvenement,
  type LigneGarage,
  type LigneIntervention,
  type LigneInvitation,
  type LigneMembre,
  type LigneNotification,
  type LigneNotificationLue,
  type LigneVehicule,
} from './mapping';

// ───────────────────────────────────────────────────────────── Réglages

const PAGE = 1000;
const DEBOUNCE_MS = 300;
const BUCKET_PHOTOS = 'photos';
const DUREE_URL_SIGNEE_S = 60 * 60;
const LIEN_REINITIALISATION = 'rencar://reinitialisation';

/** Tables écoutées en temps réel (toutes portent garage_id sauf garages). */
const TABLES_TEMPS_REEL = [
  'garages',
  'membres',
  'invitations',
  'clients',
  'vehicules',
  'interventions',
  'commentaires',
  'photos',
  'evenements',
  'appels',
  'notifications',
  'notifications_lues',
  // Les suppressions ne sont pas diffusées (fuite entre garages) : chacune
  // laisse une ligne ici, lisible par le seul garage (0007_temps_reel).
  'suppressions',
] as const;

const COULEURS = ['#2f6bff', '#d92632', '#1f9d55', '#d98b00', '#7c3aed', '#0891b2'];

// ─────────────────────────────────────────────────────────────── Client

export function creerClientSupabase(): SupabaseClient {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const cle = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !cle) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY sont requis pour le backend supabase.');
  }
  return createClient(url, cle, {
    auth: {
      // Sur le téléphone, la session vit dans AsyncStorage ; sur le web, localStorage.
      ...(Platform.OS === 'web' ? {} : { storage: AsyncStorage }),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

// ─────────────────────────────────────────────────────────────── Erreurs

type ErreurDistante = { message: string; code?: string | null };

/** Erreur Supabase → message lisible en français (les exceptions de nos fonctions SQL le sont déjà). */
function erreur(e: ErreurDistante): Error {
  const message = e.message ?? 'Erreur inconnue.';
  if (/permission denied|violates row-level security/i.test(message)) {
    return new Error('Vous n’avez pas le droit d’effectuer cette action.');
  }
  if (/invalid login credentials|invalid_credentials/i.test(message)) {
    return new Error('Adresse ou mot de passe incorrect.');
  }
  if (/email not confirmed/i.test(message)) {
    return new Error('Cette adresse n’a pas encore été confirmée.');
  }
  if (/failed to fetch|network request failed|load failed/i.test(message)) {
    return new Error('Impossible de joindre le serveur. Vérifiez la connexion.');
  }
  if (e.code === '23505') {
    return new Error('Cette valeur existe déjà.');
  }
  return new Error(message);
}

function sansErreur(r: { error: ErreurDistante | null }): void {
  if (r.error) throw erreur(r.error);
}

function donnees<T>(r: { data: T | null; error: ErreurDistante | null }, absent = 'Donnée introuvable.'): T {
  if (r.error) throw erreur(r.error);
  if (r.data === null || r.data === undefined) throw new Error(absent);
  return r.data;
}

// ─────────────────────────────────────────────────────────────── Outils

/** UUID v4 : crypto.randomUUID quand il existe, sinon un tirage au même format (colonnes uuid). */
function identifiant(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (l) => {
    const r = Math.floor(Math.random() * 16);
    return (l === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Résultat d’un appel de fonction Edge : réponse, ou fonction absente (repli local). */
type ResultatFonction<T> = { ok: true; donnees: T } | { ok: false; absente: true };

function extensionDe(uri: string): string | null {
  const m = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(uri);
  return m ? m[1].toLowerCase() : null;
}

const TYPES_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
};

const plateforme = (): 'ios' | 'android' | 'web' =>
  Platform.OS === 'android' ? 'android' : Platform.OS === 'web' ? 'web' : 'ios';

// ───────────────────────────────────────────── Présence (console Rencar)

/** Un signal au plus toutes les 10 minutes par membre. */
const INTERVALLE_PRESENCE_MS = 10 * 60 * 1000;

/** Version de l’app (celle de la mise à jour à distance si elle en porte une). */
function versionApp(): string {
  return Constants.expoConfig?.version ?? '';
}

/** « iPhone 17 Pro » et « iOS 26.0 » ; vide si le module natif manque. */
function appareil(): { modele: string; systeme: string } {
  try {
    const Device = require('expo-device') as typeof import('expo-device');
    return {
      modele: Device.modelName ?? '',
      systeme: [Device.osName, Device.osVersion].filter(Boolean).join(' '),
    };
  } catch {
    return { modele: '', systeme: '' };
  }
}

/** Notifications autorisées sur ce téléphone (sans rien demander à la personne). */
async function pushAutorise(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const N = require('expo-notifications') as typeof import('expo-notifications');
    const p = await N.getPermissionsAsync();
    return p.granted || p.ios?.status === N.IosAuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────────── Repo

export class SupabaseRepo implements Repo {
  private membre: Membre | null = null;
  private garageId: string | null = null;
  private dernier: Snapshot | null = null;
  /** Invitations pas encore acceptées, présentées comme des membres en attente. */
  private invitationsEnAttente = new Set<string>();

  private abonnes = new Set<(s: Snapshot) => void>();
  private canal: RealtimeChannel | null = null;
  private minuterie: ReturnType<typeof setTimeout> | null = null;
  /** File des rechargements : un seul à la fois, les demandes en attente sont fusionnées. */
  private chaine: Promise<unknown> = Promise.resolve();
  private prochain: Promise<Snapshot> | null = null;

  /** Présence : dernier membre signalé, heure du signal, temps de premier plan pas encore signalé. */
  private membreSignale: string | null = null;
  private dernierSignal = 0;
  private premierPlanDepuis: number | null = AppState.currentState === 'active' ? Date.now() : null;
  private premierPlanNonSignaleMs = 0;
  /** Heure du passage en arrière-plan (rechargement au retour s'il a duré). */
  private quitteLe: number | null = null;

  /** Présence sur les fiches : canal privé `consultations:<garage>` (0007_temps_reel). */
  private presence: RealtimeChannel | null = null;
  private presenceOuverte = false;
  private ficheConsultee: string | null = null;
  private consultations: Consultations = {};
  private abonnesConsultations = new Set<(c: Consultations) => void>();

  constructor(private readonly client: SupabaseClient = creerClientSupabase()) {
    if (Platform.OS !== 'web') {
      // Recommandation Supabase pour Expo : rafraîchir le jeton seulement au premier plan.
      AppState.addEventListener('change', (etat) => {
        if (etat === 'active') void this.client.auth.startAutoRefresh();
        else void this.client.auth.stopAutoRefresh();
      });
    }
    AppState.addEventListener('change', (etat) => this.suivrePremierPlan(etat));
  }

  private get gid(): string {
    if (!this.garageId) throw new Error('Aucune session ouverte.');
    return this.garageId;
  }

  private get moi(): Membre {
    if (!this.membre) throw new Error('Aucune session ouverte.');
    return this.membre;
  }

  /**
   * Appelle une fonction Edge avec le JWT de la session. Un refus (4xx, 5xx
   * avec le message `erreur` de la fonction) devient une erreur lisible ; une
   * fonction non déployée ou injoignable renvoie `absente` pour que l’appelant
   * applique son repli local.
   */
  private async fonction<T = unknown>(nom: string, body: Record<string, unknown>): Promise<ResultatFonction<T>> {
    let reponse: { data: T | null; error: unknown };
    try {
      reponse = await this.client.functions.invoke<T>(nom, { body });
    } catch (e) {
      reponse = { data: null, error: e };
    }
    const e = reponse.error;
    if (!e) return { ok: true, donnees: reponse.data as T };
    if (e instanceof FunctionsHttpError) {
      let message: string | null = null;
      try {
        const corps = (await e.context.json()) as { erreur?: unknown };
        if (typeof corps.erreur === 'string' && corps.erreur) message = corps.erreur;
      } catch {
        // Corps non JSON : passerelle Supabase.
      }
      if (message) throw new Error(message);
      if (e.context.status === 404) {
        if (__DEV__) console.warn(`Fonction ${nom} non déployée.`);
        return { ok: false, absente: true };
      }
      throw new Error(`La fonction « ${nom} » a répondu ${e.context.status}.`);
    }
    if (e instanceof FunctionsFetchError || e instanceof FunctionsRelayError) {
      if (__DEV__) console.warn(`Fonction ${nom} injoignable :`, e.message);
      return { ok: false, absente: true };
    }
    throw erreur(e as ErreurDistante);
  }

  // ── Session

  async sessionCourante(): Promise<Session | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error || !data.session) return null;
    return this.ouvrirSession(data.session.user.id);
  }

  async connecter(id: Identifiants): Promise<Session> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: id.email.trim().toLowerCase(),
      password: id.motDePasse,
    });
    if (error) throw erreur(error);
    const session = await this.ouvrirSession(data.user.id);
    if (!session) {
      await this.client.auth.signOut({ scope: 'local' });
      throw new Error('Ce compte n’est rattaché à aucun garage actif.');
    }
    return session;
  }

  async connecterDemo(): Promise<Session> {
    // Jamais de compte de démonstration sur un projet joignable : la démo d’un
    // build supabase est locale (bascule vers DemoRepo dans data/index.ts).
    throw new Error('Le garage de démonstration s’ouvre sur ce téléphone, sans connexion au serveur.');
  }

  async deconnecter(): Promise<void> {
    this.fermerCanal();
    this.fermerPresence();
    await this.client.auth.signOut();
    this.membre = null;
    this.garageId = null;
    this.dernier = null;
    this.oublierPresence();
  }

  async demanderReinitialisation(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: LIEN_REINITIALISATION,
    });
    if (error) throw erreur(error);
  }

  async reinitialiserMotDePasse(email: string, code: string, motDePasse: string): Promise<Session> {
    return this.validerCode(email, code, 'recovery', motDePasse);
  }

  async activerCompte(email: string, code: string, motDePasse: string): Promise<Session> {
    return this.validerCode(email, code, 'invite', motDePasse);
  }

  /**
   * Code à 6 chiffres de l'e-mail (gabarits supabase/templates, `{{ .Token }}`),
   * plutôt qu'un lien : rien à ouvrir depuis la messagerie, aucun lien
   * consommé par un antivirus. Le code ouvre une session, puis le mot de
   * passe choisi la remplace.
   */
  private async validerCode(email: string, code: string, type: 'invite' | 'recovery', motDePasse: string): Promise<Session> {
    const { data, error } = await this.client.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.replace(/\D/g, ''),
      type,
    });
    if (error || !data.user) throw new Error('Code invalide ou expiré. Demandez un nouvel e-mail.');
    const maj = await this.client.auth.updateUser({ password: motDePasse });
    if (maj.error) throw erreur(maj.error);
    const session = await this.ouvrirSession(data.user.id);
    if (!session) {
      await this.client.auth.signOut({ scope: 'local' });
      throw new Error('Ce compte n’est rattaché à aucun garage actif.');
    }
    return session;
  }

  async changerMotDePasse(actuel: string, nouveau: string): Promise<void> {
    const { data } = await this.client.auth.getUser();
    const email = data.user?.email;
    if (!email) throw new Error('Aucune session ouverte.');
    const verification = await this.client.auth.signInWithPassword({ email, password: actuel });
    if (verification.error) throw new Error('Le mot de passe actuel est incorrect.');
    const { error } = await this.client.auth.updateUser({ password: nouveau });
    if (error) throw erreur(error);
  }

  async supprimerMonCompte(): Promise<void> {
    sansErreur(await this.client.rpc('supprimer_mon_compte'));
    this.fermerCanal();
    this.fermerPresence();
    // L’utilisateur n’existe plus côté serveur : on efface seulement la session locale.
    await this.client.auth.signOut({ scope: 'local' });
    this.membre = null;
    this.garageId = null;
    this.dernier = null;
    this.oublierPresence();
  }

  // ── Présence (console Rencar)

  /** Cumule le temps passé au premier plan ; au retour, signale la présence (au plus toutes les 10 minutes). */
  private suivrePremierPlan(etat: AppStateStatus) {
    const maintenant = Date.now();
    // En arrière-plan, l'employé ne consulte plus rien.
    this.publierConsultation(etat === 'active' ? this.ficheConsultee : null);
    if (etat === 'active') {
      // Retour au premier plan après au moins 30 s : rattraper ce que le temps
      // réel a pu manquer (pas pour un simple coup d'œil au centre de contrôle).
      if (this.canal && this.quitteLe !== null && maintenant - this.quitteLe > 30_000) this.planifierRechargement();
      this.quitteLe = null;
      if (this.premierPlanDepuis === null) this.premierPlanDepuis = maintenant;
      void this.signalerPresence();
    } else if (this.premierPlanDepuis !== null) {
      this.quitteLe = maintenant;
      this.premierPlanNonSignaleMs += maintenant - this.premierPlanDepuis;
      this.premierPlanDepuis = null;
    }
  }

  /**
   * `rpc('signaler_presence')` : +1 session sur la ligne du jour, minutes de
   * premier plan depuis le dernier signal, version, modèle, système et
   * permission push. Au plus une fois toutes les 10 minutes par membre. Ne
   * lève jamais : sans réseau, sans la migration 0005 ou pour un compte
   * désactivé, l’app continue comme si de rien n’était.
   */
  private async signalerPresence(): Promise<void> {
    try {
      const membre = this.membre;
      if (!membre) return;
      const maintenant = Date.now();
      if (this.membreSignale === membre.id && maintenant - this.dernierSignal < INTERVALLE_PRESENCE_MS) return;
      this.membreSignale = membre.id;
      this.dernierSignal = maintenant;

      const minutes = Math.min(1440, Math.floor(this.premierPlanNonSignaleMs / 60_000));
      const { modele, systeme } = appareil();
      const { error } = await this.client.rpc('signaler_presence', {
        p_version_app: versionApp(),
        p_modele: modele,
        p_systeme: systeme,
        p_push: await pushAutorise(),
        p_minutes: minutes,
      });
      if (error) {
        if (__DEV__) console.warn('Présence non signalée :', error.message);
        return;
      }
      this.premierPlanNonSignaleMs = Math.max(0, this.premierPlanNonSignaleMs - minutes * 60_000);
    } catch (e) {
      if (__DEV__) console.warn('Présence non signalée :', e instanceof Error ? e.message : e);
    }
  }

  /** Changement de compte : le temps de premier plan déjà compté n’appartient pas au suivant. */
  private oublierPresence() {
    this.membreSignale = null;
    this.dernierSignal = 0;
    this.premierPlanNonSignaleMs = 0;
    this.premierPlanDepuis = AppState.currentState === 'active' ? Date.now() : null;
  }

  /** Lit membres puis garages ; null si le membre n’existe pas ou n’est plus actif (masqué par la RLS). */
  private async ouvrirSession(uid: string): Promise<Session | null> {
    const m = donnees<LigneMembre | null>(
      await this.client.from('membres').select('*').eq('id', uid).maybeSingle(),
      'Membre introuvable.',
    );
    if (!m) return null;
    const g = donnees<LigneGarage>(await this.client.from('garages').select('*').eq('id', m.garage_id).single());
    let membre = versMembre(m);
    if (m.invitation_en_attente) {
      // Première ouverture après invitation : le compte n’est plus « en attente ».
      const { error } = await this.client.from('membres').update({ invitation_en_attente: false }).eq('id', uid);
      if (!error) membre = versMembre({ ...m, invitation_en_attente: false });
    }
    this.membre = membre;
    this.garageId = g.id;
    void this.signalerPresence();
    return { membre, garage: versGarage(g) };
  }

  // ── Lecture

  /** Toutes les lignes d’une table du garage, par pages de 1 000. */
  private async tout<T>(table: string, options: { colonnes?: string; ordre?: string; descendant?: boolean } = {}): Promise<T[]> {
    const { colonnes = '*', ordre = 'id', descendant = false } = options;
    const resultat: T[] = [];
    for (let depuis = 0; ; depuis += PAGE) {
      let requete = this.client.from(table).select(colonnes).eq('garage_id', this.gid).order(ordre, { ascending: !descendant });
      if (ordre !== 'id') requete = requete.order('id', { ascending: true });
      const { data, error } = await requete.range(depuis, depuis + PAGE - 1);
      if (error) throw erreur(error);
      const page = (data ?? []) as T[];
      resultat.push(...page);
      if (page.length < PAGE) break;
    }
    return resultat;
  }

  private async invitationsEnAttenteDuGarage(): Promise<LigneInvitation[]> {
    // Seul un gérant les voit : pour un employé, la RLS renvoie une liste vide.
    const { data, error } = await this.client
      .from('invitations')
      .select('*')
      .eq('garage_id', this.gid)
      .is('acceptee_le', null)
      .order('cree_le', { ascending: true });
    if (error) throw erreur(error);
    return (data ?? []) as LigneInvitation[];
  }

  /** URL signées (1 h) des photos ; une signature ratée laisse simplement l’URI vide. */
  private async signer(chemins: string[]): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    const uniques = [...new Set(chemins)];
    if (!uniques.length) return urls;
    const { data, error } = await this.client.storage.from(BUCKET_PHOTOS).createSignedUrls(uniques, DUREE_URL_SIGNEE_S);
    if (error || !data) return urls;
    for (const r of data) {
      if (r.path && r.signedUrl) urls.set(r.path, r.signedUrl);
    }
    return urls;
  }

  async charger(): Promise<Snapshot> {
    const gid = this.gid;
    const [
      garage,
      membres,
      invitations,
      clients,
      vehicules,
      interventions,
      commentaires,
      evenements,
      appels,
      notifications,
      notificationsLues,
    ] = await Promise.all([
        this.client
          .from('garages')
          .select('*')
          .eq('id', gid)
          .single()
          .then((r) => donnees<LigneGarage>(r, 'Garage introuvable.')),
        this.tout<LigneMembre>('membres', { ordre: 'prenom' }),
        this.invitationsEnAttenteDuGarage(),
        this.tout<LigneClient>('clients', { ordre: 'nom' }),
        this.tout<LigneVehicule>('vehicules', { ordre: 'plaque' }),
        this.tout<LigneIntervention>('interventions_visibles', { ordre: 'debut' }),
        this.tout<LigneCommentaire>('commentaires', { colonnes: '*, photos(*)', ordre: 'cree_le' }),
        this.tout<LigneEvenement>('evenements', { ordre: 'cree_le' }),
        this.tout<LigneAppel>('appels', { ordre: 'debut', descendant: true }),
        this.tout<LigneNotification>('notifications', { ordre: 'cree_le', descendant: true }),
        this.tout<LigneNotificationLue>('notifications_lues', { ordre: 'notification_id' }),
      ]);

    this.invitationsEnAttente = new Set(invitations.map((i) => i.id));
    const urls = await this.signer(commentaires.flatMap((c) => (c.photos ?? []).map((p) => p.chemin)));
    const lues = new Set(notificationsLues.map((l) => l.notification_id));

    const snapshot: Snapshot = {
      garage: versGarage(garage),
      membres: [...membres.map(versMembre), ...invitations.map(versMembreDepuisInvitation)],
      clients: clients.map(versClient),
      vehicules: vehicules.map(versVehicule),
      interventions: interventions.map(versIntervention),
      commentaires: commentaires.map((c) => versCommentaire(c, urls)),
      evenements: evenements.map(versEvenement),
      appels: appels.map(versAppel),
      notifications: notifications.map((n) => versNotification(n, lues)),
    };
    this.dernier = snapshot;
    return snapshot;
  }

  abonner(cb: (s: Snapshot) => void): () => void {
    this.abonnes.add(cb);
    this.ouvrirCanal();
    return () => {
      this.abonnes.delete(cb);
      if (!this.abonnes.size) this.fermerCanal();
    };
  }

  private ouvrirCanal() {
    if (this.canal || !this.garageId) return;
    const gid = this.garageId;
    let canal = this.client.channel(`garage-${gid}`);
    for (const table of TABLES_TEMPS_REEL) {
      canal = canal.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: table === 'garages' ? `id=eq.${gid}` : `garage_id=eq.${gid}` },
        () => this.planifierRechargement(),
      );
    }
    // Après une coupure (téléphone verrouillé, réseau), le canal se réabonne :
    // ce qui a changé entre-temps n'a pas été diffusé, on recharge.
    let premiere = true;
    this.canal = canal.subscribe((statut) => {
      if (statut !== 'SUBSCRIBED') return;
      if (premiere) premiere = false;
      else this.planifierRechargement();
    });
  }

  private fermerCanal() {
    if (this.minuterie) {
      clearTimeout(this.minuterie);
      this.minuterie = null;
    }
    if (this.canal) {
      void this.client.removeChannel(this.canal);
      this.canal = null;
    }
  }

  // ──────────────────────────────────────── Présence sur les fiches

  signalerConsultation(fiche: string | null): void {
    this.ficheConsultee = fiche;
    this.ouvrirPresence();
    this.publierConsultation(fiche);
  }

  abonnerConsultations(cb: (c: Consultations) => void): () => void {
    this.abonnesConsultations.add(cb);
    this.ouvrirPresence();
    cb(this.consultations);
    return () => {
      this.abonnesConsultations.delete(cb);
    };
  }

  /** Canal privé du garage ; la présence n'est publiée qu'une fois l'abonnement établi. */
  private ouvrirPresence() {
    if (this.presence || !this.garageId || !this.membre) return;
    const canal = this.client.channel(`consultations:${this.garageId}`, {
      config: { private: true, presence: { key: this.membre.id } },
    });
    canal.on('presence', { event: 'sync' }, () => {
      const c: Consultations = {};
      for (const [membreId, metas] of Object.entries(canal.presenceState<{ fiche: string | null }>())) {
        for (const { fiche } of metas) {
          if (fiche && !(c[fiche] ??= []).includes(membreId)) c[fiche].push(membreId);
        }
      }
      this.consultations = c;
      for (const cb of this.abonnesConsultations) cb(c);
    });
    canal.subscribe((statut) => {
      this.presenceOuverte = statut === 'SUBSCRIBED';
      if (this.presenceOuverte) this.publierConsultation(AppState.currentState === 'active' ? this.ficheConsultee : null);
    });
    this.presence = canal;
  }

  private publierConsultation(fiche: string | null) {
    if (!this.presence || !this.presenceOuverte) return;
    // Échec sans conséquence : l'indicateur est un confort, la fiche reste utilisable.
    this.presence.track({ fiche }).catch(() => undefined);
  }

  private fermerPresence() {
    if (this.presence) {
      void this.client.removeChannel(this.presence);
      this.presence = null;
    }
    this.presenceOuverte = false;
    this.ficheConsultee = null;
    this.consultations = {};
  }

  /** Les changements distants arrivent en rafale : un seul rechargement 300 ms après le dernier. */
  private planifierRechargement() {
    if (this.minuterie) clearTimeout(this.minuterie);
    this.minuterie = setTimeout(() => {
      this.minuterie = null;
      this.recharger().catch(() => undefined);
    }, DEBOUNCE_MS);
  }

  /**
   * Recharge et notifie. Les rechargements sont sérialisés ; une demande faite
   * pendant qu’un rechargement tourne en déclenche un nouveau (pour ne pas
   * rater ce qui vient d’être écrit), les demandes en attente sont fusionnées.
   */
  private recharger(): Promise<Snapshot> {
    if (this.prochain) return this.prochain;
    const p = this.chaine.then(async () => {
      this.prochain = null;
      const s = await this.charger();
      this.abonnes.forEach((cb) => cb(s));
      return s;
    });
    this.prochain = p;
    this.chaine = p.catch(() => undefined);
    return p;
  }

  private async instantane(): Promise<Snapshot> {
    return this.dernier ?? this.charger();
  }

  /** Un identifiant d’invitation en attente n’est pas un membre affectable. */
  private membreReel(id: string | null): string | null {
    return id && !this.invitationsEnAttente.has(id) ? id : null;
  }

  // ── Interventions

  async creerIntervention(n: NouvelleIntervention): Promise<Intervention> {
    const gid = this.gid;
    const moi = this.moi;
    const clientId = 'id' in n.client ? n.client.id : (await this.insererClient(n.client)).id;
    const vehiculeId =
      'id' in n.vehicule ? n.vehicule.id : (await this.insererVehicule({ clientId, ...n.vehicule })).id;

    // Sans voirTout, une fiche non attribuée ou confiée à un collègue serait
    // invisible pour son auteur (RLS) : elle lui est confiée, il pourra la
    // passer à un collègue depuis la fiche.
    const membreId = peut(moi, 'voirTout') ? this.membreReel(n.membreId) : moi.id;
    const id = identifiant();
    const ligne = {
      id,
      garage_id: gid,
      client_id: clientId,
      vehicule_id: vehiculeId,
      prestation: n.prestation,
      demande: n.demande ?? null,
      statut: (n.confirmee ? 'planifie' : 'a_valider') satisfies Statut,
      origine: n.origine,
      membre_id: membreId,
      prioritaire: Boolean(n.prioritaire),
      debut: n.debut,
      duree_min: n.dureeMin,
      memo: n.memo ?? null,
      montant_estime: n.montantEstime ?? null,
    };
    // Sans RETURNING : soumis à la policy de lecture, et montant_estime n’y est pas lisible.
    sansErreur(await this.client.from('interventions').insert(ligne));
    const s = await this.recharger();
    const cree = s.interventions.find((i) => i.id === id);
    if (!cree) throw new Error('Intervention créée mais introuvable au rechargement.');
    return cree;
  }

  async changerStatut(id: string, vers: Statut): Promise<void> {
    sansErreur(await this.client.from('interventions').update({ statut: vers }).eq('id', id));
    await this.recharger();
  }

  async changerBlocage(id: string, vers: Blocage | null): Promise<void> {
    sansErreur(await this.client.from('interventions').update({ blocage: vers }).eq('id', id));
    await this.recharger();
  }

  async affecter(id: string, membreId: string | null): Promise<void> {
    sansErreur(await this.client.from('interventions').update({ membre_id: this.membreReel(membreId) }).eq('id', id));
    await this.recharger();
  }

  async modifierIntervention(id: string, patch: Parameters<Repo['modifierIntervention']>[1]): Promise<void> {
    const ligne = patchInterventionVersLigne(patch);
    if (!Object.keys(ligne).length) return;
    sansErreur(await this.client.from('interventions').update(ligne).eq('id', id));
    await this.recharger();
  }

  async commenter(c: Parameters<Repo['commenter']>[0]): Promise<Commentaire> {
    const gid = this.gid;
    const moi = this.moi;
    const { id } = donnees<{ id: string }>(
      await this.client
        .from('commentaires')
        .insert({
          garage_id: gid,
          intervention_id: c.interventionId,
          auteur_id: moi.id,
          auteur_nom: moi.prenom,
          texte: c.texte,
          visible_client: c.visibleClient,
        })
        .select('id')
        .single(),
    );
    for (const photo of c.photos ?? []) {
      const chemin = await this.televerser(c.interventionId, photo);
      sansErreur(
        await this.client.from('photos').insert({
          garage_id: gid,
          commentaire_id: id,
          chemin,
          video: Boolean(photo.video),
        }),
      );
    }
    const s = await this.recharger();
    const cree = s.commentaires.find((k) => k.id === id);
    if (!cree) throw new Error('Commentaire créé mais introuvable au rechargement.');
    return cree;
  }

  /** Envoie un fichier local dans le bucket photos et renvoie son chemin. */
  private async televerser(interventionId: string, photo: { uri: string; video?: boolean }): Promise<string> {
    const reponse = await fetch(photo.uri);
    if (!reponse.ok) throw new Error('Photo illisible sur le téléphone.');
    const contenu = await reponse.arrayBuffer();
    const extension = extensionDe(photo.uri) ?? (photo.video ? 'mp4' : 'jpg');
    const contentType = reponse.headers.get('content-type') ?? TYPES_MIME[extension] ?? 'application/octet-stream';
    const chemin = `${this.gid}/${interventionId}/${identifiant()}.${extension}`;
    const { error } = await this.client.storage.from(BUCKET_PHOTOS).upload(chemin, contenu, { contentType, upsert: false });
    if (error) throw new Error(`Envoi de la photo impossible : ${error.message}`);
    return chemin;
  }

  async envoyerSmsPret(interventionId: string, _auteurId: string, texte: string): Promise<void> {
    // L’envoi réel et le journal (évènement « sms ») sont faits par la fonction
    // Edge « sms », seule à pouvoir écrire ce journal (0006) ; un refus (SMS
    // désactivés pour le garage, numéro invalide…) remonte à l’écran. Fonction
    // absente ou injoignable : aucun SMS n’est parti, on le dit plutôt que de
    // journaliser un envoi qui n’a pas eu lieu.
    const r = await this.fonction('sms', { intervention_id: interventionId, type: 'pret', texte });
    if (!r.ok) throw new Error('Le SMS n’a pas pu être envoyé : service indisponible, réessayez dans un instant.');
    await this.recharger();
  }

  // ── Clients et véhicules

  private async insererClient(c: Parameters<Repo['creerClient']>[0]): Promise<Client> {
    const ligne: LigneClient = {
      id: identifiant(),
      garage_id: this.gid,
      prenom: c.prenom,
      nom: c.nom,
      telephone: c.telephone,
      email: c.email ?? null,
      memo: c.memo ?? null,
      cree_le: new Date().toISOString(),
    };
    // Sans RETURNING (voir l’en-tête du fichier).
    sansErreur(await this.client.from('clients').insert(ligne));
    return versClient(ligne);
  }

  async creerClient(c: Parameters<Repo['creerClient']>[0]): Promise<Client> {
    const cree = await this.insererClient(c);
    await this.recharger();
    return cree;
  }

  async modifierClient(id: string, patch: Parameters<Repo['modifierClient']>[1]): Promise<void> {
    const ligne = patchClientVersLigne(patch);
    if (!Object.keys(ligne).length) return;
    sansErreur(await this.client.from('clients').update(ligne).eq('id', id));
    await this.recharger();
  }

  private async insererVehicule(v: Parameters<Repo['creerVehicule']>[0]): Promise<Vehicule> {
    const ligne: LigneVehicule = {
      id: identifiant(),
      garage_id: this.gid,
      client_id: v.clientId,
      plaque: v.plaque,
      marque: v.marque,
      modele: v.modele,
      version: v.version ?? null,
      annee: v.annee ?? null,
      km: v.km ?? null,
      origine_donnees: 'saisie',
    };
    // Sans RETURNING (voir l’en-tête du fichier).
    sansErreur(await this.client.from('vehicules').insert(ligne));
    return versVehicule(ligne);
  }

  async creerVehicule(v: Parameters<Repo['creerVehicule']>[0]): Promise<Vehicule> {
    const cree = await this.insererVehicule(v);
    await this.recharger();
    return cree;
  }

  async modifierVehicule(id: string, patch: Parameters<Repo['modifierVehicule']>[1]): Promise<void> {
    const ligne = patchVehiculeVersLigne(patch);
    if (!Object.keys(ligne).length) return;
    sansErreur(await this.client.from('vehicules').update(ligne).eq('id', id));
    await this.recharger();
  }

  // ── Appels (option réceptionniste)

  /**
   * Passe la fiche proposée par le réceptionniste de « à valider » à `vers`.
   * La fiche n’est attribuée à personne : un employé sans voirTout ne la voit
   * pas, l’update ne touche alors aucune ligne et on le dit plutôt que de ne
   * rien faire.
   */
  private async traiterFicheProposee(interventionId: string, vers: Statut): Promise<void> {
    const { count, error } = await this.client
      .from('interventions')
      .update({ statut: vers }, { count: 'exact' })
      .eq('id', interventionId)
      .eq('statut', 'a_valider' satisfies Statut);
    if (error) throw erreur(error);
    if (!count) {
      throw new Error(
        'Cette fiche n’est plus à valider, ou elle n’est pas visible pour vous : demandez la permission « Voir tout le planning ».',
      );
    }
  }

  async validerAppel(appelId: string): Promise<Intervention | null> {
    const appel = (await this.instantane()).appels.find((a) => a.id === appelId);
    if (!appel?.interventionId) return null;
    await this.traiterFicheProposee(appel.interventionId, 'planifie');
    const s = await this.recharger();
    return s.interventions.find((i) => i.id === appel.interventionId) ?? null;
  }

  async ignorerAppel(appelId: string): Promise<void> {
    const appel = (await this.instantane()).appels.find((a) => a.id === appelId);
    if (!appel?.interventionId) return;
    await this.traiterFicheProposee(appel.interventionId, 'annule');
    await this.recharger();
  }

  async lierAppel(appelId: string, interventionId: string): Promise<void> {
    sansErreur(await this.client.from('appels').update({ intervention_id: interventionId }).eq('id', appelId));
    await this.recharger();
  }

  // ── Notifications

  // « Lue » est propre à chaque membre (table notifications_lues) : ouvrir une
  // notification du garage ne la retire pas de la cloche des collègues.

  async marquerLue(id: string): Promise<void> {
    sansErreur(
      await this.client
        .from('notifications_lues')
        .upsert(
          { garage_id: this.gid, notification_id: id, membre_id: this.moi.id },
          { onConflict: 'notification_id,membre_id', ignoreDuplicates: true },
        ),
    );
    await this.recharger();
  }

  async toutMarquerLu(_membreId: string): Promise<void> {
    const moi = this.moi.id;
    const lignes = (await this.instantane()).notifications
      .filter((n) => !n.lue && (n.membreId === null || n.membreId === moi))
      .map((n) => ({ garage_id: this.gid, notification_id: n.id, membre_id: moi }));
    if (lignes.length) {
      sansErreur(
        await this.client
          .from('notifications_lues')
          .upsert(lignes, { onConflict: 'notification_id,membre_id', ignoreDuplicates: true }),
      );
    }
    await this.recharger();
  }

  async enregistrerJetonPush(_membreId: string, jeton: string): Promise<void> {
    sansErreur(
      await this.client
        .from('jetons_push')
        .upsert(
          { garage_id: this.gid, membre_id: this.moi.id, jeton, plateforme: plateforme() },
          { onConflict: 'jeton' },
        ),
    );
  }

  // ── Équipe et réglages (gérant)

  async inviterMembre(n: NouveauMembre): Promise<Membre> {
    const gid = this.gid;
    const email = n.email.trim().toLowerCase();
    const permissions = n.role === 'gerant' ? TOUTES_PERMISSIONS : (n.permissions ?? POSTES[n.poste].permissions);
    const couleur = COULEURS[(this.dernier?.membres.length ?? 0) % COULEURS.length];

    const reponse = await this.client
      .from('invitations')
      .insert({
        garage_id: gid,
        email,
        prenom: n.prenom,
        nom: n.nom,
        role: n.role,
        poste: n.poste,
        permissions,
        couleur,
        invite_par: this.moi.id,
      })
      .select('*')
      .single();
    if (reponse.error?.code === '23505') throw new Error('Une invitation est déjà en attente pour cette adresse.');
    const invitation = donnees<LigneInvitation>(reponse);

    // L’e-mail part par la fonction Edge « inviter » ; à la création de
    // l’utilisateur Auth, le trigger crée le membre et marque l’invitation
    // acceptée. Fonction absente : l’invitation reste en attente. Refus
    // (adresse déjà inscrite, envoi impossible…) : on retire l’invitation que
    // l’on vient de créer et on remonte le message.
    try {
      await this.fonction('inviter', { invitation_id: invitation.id });
    } catch (e) {
      await this.client.from('invitations').delete().eq('id', invitation.id);
      throw e;
    }

    const s = await this.recharger();
    return (
      s.membres.find((m) => !this.invitationsEnAttente.has(m.id) && m.email.toLowerCase() === email) ??
      s.membres.find((m) => m.id === invitation.id) ??
      versMembreDepuisInvitation(invitation)
    );
  }

  async modifierMembre(id: string, patch: Parameters<Repo['modifierMembre']>[1]): Promise<void> {
    if (this.invitationsEnAttente.has(id)) {
      // Membre pas encore arrivé : on agit sur l’invitation (révoquer = supprimer).
      if (patch.actif === false) {
        sansErreur(await this.client.from('invitations').delete().eq('id', id));
      } else {
        const { actif: _ignore, ...reste } = patchMembreVersLigne(patch);
        const ligne = compacter({
          ...reste,
          permissions: reste.role === 'gerant' ? TOUTES_PERMISSIONS : reste.permissions,
        });
        if (Object.keys(ligne).length) sansErreur(await this.client.from('invitations').update(ligne).eq('id', id));
      }
    } else {
      const ligne = patchMembreVersLigne(patch);
      if (Object.keys(ligne).length) sansErreur(await this.client.from('membres').update(ligne).eq('id', id));
    }
    await this.recharger();
  }

  async modifierGarage(patch: Parameters<Repo['modifierGarage']>[0]): Promise<void> {
    const ligne = patchGarageVersLigne(patch);
    if (!Object.keys(ligne).length) return;
    if (patch.options) {
      // Seul smsAutomatique est au gérant (garages_garde, 0006). On repart des
      // options en base, clés réservées comprises, même celles que l'app ne
      // connaît pas (agent, VoIP…) : les renvoyer incomplètes serait refusé.
      const { options } = donnees(await this.client.from('garages').select('options').eq('id', this.gid).single<Pick<LigneGarage, 'options'>>());
      ligne.options = { ...options, smsAutomatique: patch.options.smsAutomatique ?? options.smsAutomatique };
    }
    sansErreur(await this.client.from('garages').update(ligne).eq('id', this.gid));
    await this.recharger();
  }
}
