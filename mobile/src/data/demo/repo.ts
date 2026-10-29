/**
 * Implémentation « démo » du contrat Repo : tout vit sur le téléphone.
 *
 * Persistance : AsyncStorage (une seule clé JSON) qui garde l'instantané,
 * le jour de sa génération et un drapeau « modifié ». Le garage de
 * démonstration est réinjecté si le stockage est vide, d'une version
 * antérieure, ou si le jour a changé sans que l'utilisateur ait rien touché
 * (les dates du seed sont relatives à « aujourd'hui »).
 *
 * Écritures sur une intervention (v2c) : un seul chemin, `ecrireIntervention`,
 * qui fait ce que font les triggers de `0014_atelier.sql` sur Supabase, avec
 * les mêmes règles (`domain/journal.ts`) : normalisation, refus R1 à R14
 * (mêmes messages), puis conséquences dans la même mutation (événements du
 * journal, note client automatique liée à son événement, étapes masquées,
 * notifications d’équipe, kilométrage du véhicule). « Annuler » (J14)
 * défait vraiment : statut, événement, note et notifications.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSameDay } from 'date-fns';

import { erreurInscription } from '@/components/auth/saisie';
import { AccesRefuse, ReceptionEchouee } from '@/data/erreurs';
import {
  AdresseNonConfirmee,
  type Consultations,
  type Identifiants,
  type NouveauMembre,
  type NouvelleInscription,
  type NouvelleIntervention,
  type PatchIntervention,
  type RenvoiReceptionniste,
  type Repo,
  type ResultatAnnulation,
  type Snapshot,
} from '@/data/repo';
import { appelEnDirect } from '@/domain/appels';
import {
  aRetirer,
  annulation,
  appliquerAccord,
  ecrire,
  REFUS,
  refusRetraitNote,
  type Consequences,
  type ContexteJournal,
} from '@/domain/journal';
import { peut, permissionsDe, POSTES, TOUTES_PERMISSIONS } from '@/domain/permissions';
import { aPrestation } from '@/domain/prestations';
import type {
  Acces,
  Blocage,
  CanalAccord,
  CanalPrevenu,
  Client,
  Commentaire,
  DemandeInscription,
  DetailBlocage,
  EcouteAppel,
  EtatTransfert,
  Intervention,
  Membre,
  MotifAnnulation,
  Session,
  Statut,
  Vehicule,
} from '@/domain/types';
import { normaliserSms } from '@/lib/sms';

import { ecouteDemo } from './ecoutes';
import { DEMO_MEMBRE_ID, snapshotDemo } from './seed';

// v3 : instantané v2c (kilométrage au dépôt, détail des blocages, événements
// et notes liés). Un instantané plus ancien est remplacé par le seed.
const CLE = 'atelier.demo.v3';
const CLE_SESSION = 'atelier.demo.session.v1';
/** Demande d'inscription de démonstration (« Créer un compte ») : une seule, sur ce téléphone. */
const CLE_DEMANDE = 'atelier.demo.demande.v1';
/** Valeur de CLE_SESSION quand la session ouverte est celle de la demande (écran d'attente). */
const SESSION_DEMANDE = 'demande';
/** Appareils qui « sonnent » en démonstration (« membre:appareil »). */
const CLE_SONNERIE = 'atelier.demo.sonnerie.v1';

type Stockage = { genereLe: string; modifie: boolean; snapshot: Snapshot };

const uid = (prefixe: string) => `${prefixe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const maintenant = () => new Date().toISOString();

// Initiales blanches lisibles (contraste ≥ 4,5:1, WCAG AA) sur chaque couleur.
const COULEURS = ['#2d66f5', '#d92632', '#1a7f45', '#a86400', '#7c3aed', '#0e7490'];

/** Numéro Rencar fictif du garage de démonstration : tranche 04 65 71 réservée à la fiction par l’Arcep. */
const NUMERO_RENCAR_DEMO = '+33465710001';
/**
 * Transforme la copie d’une intervention : reçoit la copie et l’instant de
 * l’écriture, rend l’intervention voulue (avant normalisation).
 */
type Transformer = (i: Intervention, t: Date) => Intervention;

/** Un appel « en cours » depuis plus de 15 minutes est terminé (instantané d'un autre jour), comme côté serveur. */
function cloreAppelsAnciens(s: Snapshot) {
  const now = Date.now();
  for (const a of s.appels) {
    if (a.enCours && !appelEnDirect(a, now)) a.enCours = false;
  }
}

export class DemoRepo implements Repo {
  private snap: Snapshot | null = null;
  private genereLe = maintenant();
  private modifie = false;
  private membreId: string | null = null;
  private abonnes = new Set<(s: Snapshot) => void>();

  // ── Chargement et persistance

  private async lire(): Promise<Snapshot> {
    if (this.snap) return this.snap;
    try {
      const brut = await AsyncStorage.getItem(CLE);
      if (brut) {
        const st = JSON.parse(brut) as Partial<Stockage>;
        if (st.snapshot && typeof st.genereLe === 'string') {
          const memeJour = isSameDay(new Date(st.genereLe), new Date());
          if (memeJour || st.modifie) {
            this.snap = st.snapshot;
            // Stockage d'avant les prestations à la carte : la démonstration a les trois.
            if (typeof this.snap.garage.options.site !== 'boolean') this.snap.garage.options.site = true;
            this.genereLe = st.genereLe;
            this.modifie = Boolean(st.modifie);
            if (!memeJour) cloreAppelsAnciens(this.snap);
            return this.snap;
          }
          // Jour changé et rien de modifié : on régénère un seed daté d'aujourd'hui.
        }
      }
    } catch {
      // stockage illisible : on repart du jeu de démonstration
    }
    this.snap = snapshotDemo();
    this.genereLe = maintenant();
    this.modifie = false;
    await this.ecrire();
    return this.snap;
  }

  private async ecrire() {
    if (!this.snap) return;
    try {
      const st: Stockage = { genereLe: this.genereLe, modifie: this.modifie, snapshot: this.snap };
      await AsyncStorage.setItem(CLE, JSON.stringify(st));
    } catch {
      // en démo, une écriture ratée n'est pas bloquante
    }
    // Copie profonde : les mutations modifient les objets en place, les écrans
    // doivent recevoir de nouvelles références pour se rafraîchir.
    const copie = structuredClone(this.snap);
    this.abonnes.forEach((cb) => cb(copie));
  }

  /**
   * Applique une mutation puis persiste et notifie. Une mutation qui refuse
   * (exception) le fait avant de toucher à l’instantané : rien n’est écrit.
   */
  private async muter(fn: (s: Snapshot) => void) {
    const s = await this.lire();
    fn(s);
    this.modifie = true;
    await this.ecrire();
  }

  /** Remet le garage de démonstration à zéro (bouton dans les réglages). */
  async reinitialiser() {
    this.snap = snapshotDemo();
    this.genereLe = maintenant();
    this.modifie = false;
    await this.ecrire();
    if (this.membreId && !this.snap.membres.some((m) => m.id === this.membreId)) await this.deconnecter();
  }

  // ── Journal (ce que font les triggers de 0014 sur Supabase)

  private membre(s: Snapshot, id: string | null | undefined): Membre | null {
    return (id && s.membres.find((m) => m.id === id)) || null;
  }

  /**
   * Contexte des règles du journal pour une intervention : son véhicule, ses
   * événements (du plus ancien au plus récent), ses notes et les
   * notifications qui la visent.
   */
  private contexte(
    s: Snapshot,
    i: Pick<Intervention, 'id' | 'vehiculeId'>,
    auteurId: string | null,
    t: Date,
    mode?: ContexteJournal['mode'],
  ): ContexteJournal {
    return {
      auteur: this.membre(s, auteurId),
      membres: s.membres,
      vehicule: s.vehicules.find((v) => v.id === i.vehiculeId),
      kmAutres: s.interventions.flatMap((x) => (x.vehiculeId === i.vehiculeId && x.id !== i.id && x.kmDepot != null ? [x.kmDepot] : [])),
      // Le journal les trie lui-même par (date, rang).
      evenements: s.evenements.filter((e) => e.interventionId === i.id),
      commentaires: s.commentaires.filter((k) => k.interventionId === i.id),
      notifications: s.notifications.filter((n) => n.cible?.type === 'intervention' && n.cible.id === i.id),
      maintenant: t,
      nouvelId: uid,
      relancesSms: aPrestation(s.garage, 'sms'),
      ...(mode ? { mode } : {}),
    };
  }

  /**
   * Instant d’une écriture sur une intervention. Sur Supabase, deux
   * écritures successives ont des now() distincts ; en démo, une horloge
   * figée (labo) ou deux gestes dans la même milliseconde leur donneraient
   * le même, et « Annuler » (J14) verrait l’écriture d’avant « au même
   * instant ». L’écriture se place donc juste après le dernier événement de
   * l’intervention s’il est au même instant ou plus tard. C’est aussi le cas
   * des événements du jeu de démonstration posés à heure fixe plus loin dans
   * la journée (« Prêt » de la Toyota à 10:34 quand on l’ouvre à 10:30) :
   * sans cela, le fil rangerait le geste avant eux et « Annuler » (J14,
   * condition 5) refuserait de défaire un Livré (intégration v2c).
   */
  private instant(s: Snapshot, interventionId: string): Date {
    const now = Date.now();
    let dernier = -Infinity;
    for (const e of s.evenements) {
      if (e.interventionId !== interventionId) continue;
      const x = new Date(e.creeLe).getTime();
      if (x >= now && x > dernier) dernier = x;
    }
    return new Date(dernier >= now ? dernier + 1 : now);
  }

  /** Ajoute ce que produit une écriture : événements, notes, masquages, notifications, km du véhicule. */
  private appliquer(s: Snapshot, vehiculeId: string, c: Consequences) {
    s.evenements.push(...c.evenements);
    s.commentaires.push(...c.commentaires);
    const masquesE = new Set(c.masquer.evenements);
    const masquesK = new Set(c.masquer.commentaires);
    for (const e of s.evenements) if (masquesE.has(e.id)) e.visibleClient = false;
    for (const k of s.commentaires) if (masquesK.has(k.id)) k.visibleClient = false;
    s.notifications.push(...c.notifications);
    for (const { id, detail } of c.notificationsCompletees) {
      const n = s.notifications.find((x) => x.id === id);
      if (n) n.detail = detail;
    }
    if (c.vehiculeKm !== undefined) {
      const v = s.vehicules.find((x) => x.id === vehiculeId);
      if (v) {
        if (c.vehiculeKm === null) delete v.km;
        else v.km = c.vehiculeKm;
      }
    }
  }

  /**
   * Seul chemin d’écriture d’une intervention existante : copie d’avant,
   * refus (R1 à R14, permissions du membre qui agit), normalisation,
   * application, puis conséquences. Le refus est levé avant toute
   * modification de l’instantané.
   */
  private ecrireIntervention(
    s: Snapshot,
    id: string,
    auteurId: string | null,
    transformer: Transformer,
    mode?: ContexteJournal['mode'],
  ): Intervention {
    const idx = s.interventions.findIndex((x) => x.id === id);
    if (idx < 0) throw new Error('Intervention introuvable.');
    const avant = structuredClone(s.interventions[idx]);
    const t = this.instant(s, id);
    const ctx = this.contexte(s, avant, auteurId, t, mode);
    // Refus sur l’écriture brute (trigger « avant »), normalisation, conséquences.
    const r = ecrire(avant, transformer(structuredClone(avant), t), ctx);
    const apres = { ...r.apres, majLe: t.toISOString() };
    s.interventions[idx] = apres;
    this.appliquer(s, apres.vehiculeId, r.consequences);
    return apres;
  }

  /** Écrit une intervention dans une mutation persistée. */
  private async ecrireEtPersister(id: string, auteurId: string | null, transformer: Transformer, mode?: ContexteJournal['mode']) {
    await this.muter((s) => {
      this.ecrireIntervention(s, id, auteurId, transformer, mode);
    });
  }

  // ── Session

  /** Membre ouvert, ou SESSION_DEMANDE pour l'écran d'attente de la demande. */
  private async idSession(): Promise<string | null> {
    if (!this.membreId) {
      try {
        this.membreId = await AsyncStorage.getItem(CLE_SESSION);
      } catch {
        this.membreId = null;
      }
    }
    return this.membreId;
  }

  async sessionCourante(): Promise<Acces | null> {
    const s = await this.lire();
    const id = await this.idSession();
    if (id === SESSION_DEMANDE) {
      const demande = await this.lireDemande();
      return demande?.emailConfirme ? { type: 'demande', demande } : null;
    }
    const membre = s.membres.find((m) => m.id === id);
    if (membre && !membre.actif) {
      // Session gardée d’un membre coupé entre-temps : on l’oublie et on le dit, au lieu d’un écran de connexion muet.
      this.membreId = null;
      try {
        await AsyncStorage.removeItem(CLE_SESSION);
      } catch {
        // Stockage indisponible : la session reste refusée à chaque reprise, avec le même message.
      }
      throw new AccesRefuse(true);
    }
    return membre ? { type: 'session', session: { membre, garage: s.garage } } : null;
  }

  async connecter(id: Identifiants): Promise<Acces> {
    const email = id.email.trim().toLowerCase();
    const demande = await this.lireDemande();
    if (demande && demande.email === email) {
      if (!demande.emailConfirme) throw new AdresseNonConfirmee(email);
      return this.ouvrirDemande(demande);
    }
    const s = await this.lire();
    const membre = s.membres.find((m) => m.email.toLowerCase() === email);
    // En démo, n'importe quel mot de passe ouvre un compte existant.
    if (!membre) throw new Error('Aucun compte avec cette adresse dans le garage de démonstration.');
    // Accès coupé par le gérant : le compte existe, on le dit (même texte qu'avec Supabase).
    if (!membre.actif) throw new AccesRefuse(true);
    return { type: 'session', session: await this.ouvrir(membre, s) };
  }

  async connecterDemo(): Promise<Session> {
    let s = await this.lire();
    // Compte de démonstration supprimé ou désactivé (stockage d'une version précédente) :
    // la démonstration repart de son état de départ plutôt que d'ouvrir un membre inactif.
    if (!s.membres.some((m) => m.id === DEMO_MEMBRE_ID && m.actif)) {
      await this.reinitialiser();
      s = await this.lire();
    }
    const membre = s.membres.find((m) => m.id === DEMO_MEMBRE_ID) ?? s.membres[0];
    return this.ouvrir(membre, s);
  }

  private async ouvrir(membre: Membre, s: Snapshot): Promise<Session> {
    await this.retenirSession(membre.id);
    return { membre, garage: s.garage };
  }

  private async retenirSession(id: string) {
    this.membreId = id;
    try {
      await AsyncStorage.setItem(CLE_SESSION, id);
    } catch {
      // ignoré
    }
  }

  async deconnecter() {
    this.membreId = null;
    try {
      await AsyncStorage.removeItem(CLE_SESSION);
    } catch {
      // ignoré
    }
  }

  // ── Inscription (démonstration : rien ne quitte le téléphone, personne ne valide)

  private async lireDemande(): Promise<DemandeInscription | null> {
    try {
      const brut = await AsyncStorage.getItem(CLE_DEMANDE);
      return brut ? (JSON.parse(brut) as DemandeInscription) : null;
    } catch {
      return null;
    }
  }

  private async ecrireDemande(d: DemandeInscription | null) {
    try {
      if (d) await AsyncStorage.setItem(CLE_DEMANDE, JSON.stringify(d));
      else await AsyncStorage.removeItem(CLE_DEMANDE);
    } catch {
      // en démo, une écriture ratée n'est pas bloquante
    }
  }

  private async ouvrirDemande(demande: DemandeInscription): Promise<Acces> {
    await this.retenirSession(SESSION_DEMANDE);
    return { type: 'demande', demande };
  }

  async inscrire(n: NouvelleInscription): Promise<{ codeEnvoye: boolean }> {
    const probleme = erreurInscription(n);
    if (probleme) throw new Error(probleme);
    const email = n.email.trim().toLowerCase();
    const s = await this.lire();
    const actuelle = await this.lireDemande();
    if (s.membres.some((m) => m.email.toLowerCase() === email) || (actuelle?.emailConfirme && actuelle.email === email)) {
      throw new Error('Un compte existe déjà avec cette adresse. Connectez-vous ou touchez « Mot de passe oublié ».');
    }
    // Une demande pas encore confirmée est remplacée, comme sur le serveur.
    await this.ecrireDemande({
      email,
      emailConfirme: false,
      prenom: n.prenom.trim(),
      nom: n.nom.trim(),
      garage: { nom: n.garage.nom.trim(), adresse: n.garage.adresse.trim(), telephone: n.garage.telephone.trim() },
      creeLe: maintenant(),
    });
    return { codeEnvoye: true };
  }

  async confirmerInscription(email: string, code: string, _motDePasse: string): Promise<Acces> {
    const demande = await this.lireDemande();
    // En démo, n'importe quel code à 6 chiffres confirme l'adresse.
    if (!demande || demande.email !== email.trim().toLowerCase() || code.replace(/\D/g, '').length !== 6) {
      throw new Error('Code invalide ou expiré. Demandez un nouveau code.');
    }
    const confirmee = { ...demande, emailConfirme: true };
    await this.ecrireDemande(confirmee);
    return this.ouvrirDemande(confirmee);
  }

  async renvoyerCodeInscription() {
    // Démo : aucun e-mail, n'importe quel code à 6 chiffres convient.
  }

  async demanderReinitialisation() {
    // Démo : rien à envoyer.
  }

  signalerConsultation(): void {
    // Démo : personne d'autre pour la voir.
  }

  /**
   * Démo : un collègue consulte en permanence l'intervention bloquée (i2) et
   * la fiche de son client (c2), pour montrer l'indicateur de présence.
   */
  abonnerConsultations(cb: (c: Consultations) => void): () => void {
    const collegue = this.snap?.membres.find((m) => m.actif && m.id !== this.membreId && m.role === 'gerant');
    cb(collegue ? { 'intervention:i2': [collegue.id], 'client:c2': [collegue.id] } : {});
    return () => undefined;
  }

  async reinitialiserMotDePasse(): Promise<Acces> {
    throw new Error('La démonstration n’a pas de mot de passe : touchez « Essayer avec le garage de démonstration ».');
  }

  async activerCompte(): Promise<Acces> {
    throw new Error('La démonstration n’a pas de compte à activer : touchez « Essayer avec le garage de démonstration ».');
  }

  async changerMotDePasse() {
    // Démo : pas de mot de passe.
  }

  async supprimerMonCompte(_o?: { avecGarage?: boolean }) {
    if ((await this.idSession()) === SESSION_DEMANDE) {
      await this.ecrireDemande(null);
      await this.deconnecter();
      return;
    }
    // Démo : supprimer son compte (avec le garage ou non) remet la démonstration à son état de
    // départ. Désactiver le membre bloquerait la démonstration : au lancement suivant, la session
    // d'un membre inactif ne s'ouvre plus et l'instantané modifié n'est jamais régénéré.
    await this.deconnecter();
    await this.reinitialiser();
  }

  // ── Lecture

  async charger(): Promise<Snapshot> {
    return structuredClone(await this.lire());
  }

  abonner(cb: (s: Snapshot) => void) {
    this.abonnes.add(cb);
    return () => {
      this.abonnes.delete(cb);
    };
  }

  // ── Interventions

  async creerIntervention(n: NouvelleIntervention, auteurId: string): Promise<Intervention> {
    let creeId = '';
    await this.muter((s) => {
      const garageId = s.garage.id;
      const auteur = this.membre(s, auteurId);
      const t = new Date();
      const nouveauClient: Client | null =
        'id' in n.client ? null : { id: uid('c'), garageId, creeLe: t.toISOString(), ...n.client };
      const clientId = 'id' in n.client ? n.client.id : nouveauClient!.id;
      const nouveauVehicule: Vehicule | null =
        'id' in n.vehicule ? null : { id: uid('v'), garageId, clientId, origineDonnees: 'saisie', ...n.vehicule };
      const vehiculeId = 'id' in n.vehicule ? n.vehicule.id : nouveauVehicule!.id;
      const cree: Intervention = {
        id: uid('i'),
        garageId,
        clientId,
        vehiculeId,
        prestation: n.prestation,
        demande: n.demande,
        statut: n.confirmee ? 'planifie' : 'a_valider',
        blocage: null,
        origine: n.origine,
        membreId: n.membreId,
        prioritaire: Boolean(n.prioritaire),
        debut: n.debut,
        dureeMin: n.dureeMin,
        restitutionPrevue: n.restitutionPrevue,
        memo: n.memo,
        // Comme 0006 : un montant saisi sans « Voir les montants » est ignoré.
        montantEstime: auteur && !permissionsDe(auteur).voirPrix ? undefined : n.montantEstime,
        kmDepot: n.kmDepot,
        suiviToken: uid('s'),
        creeLe: t.toISOString(),
        majLe: t.toISOString(),
      };
      // Refus R14, puis événement de création (J13), notification d’attribution
      // (N1) et km du véhicule (J12). Un refus survient avant toute écriture :
      // client et véhicule nouveaux ne sont ajoutés qu’ensuite.
      const ctx = this.contexte(s, cree, auteurId, t);
      if (nouveauVehicule) ctx.vehicule = nouveauVehicule;
      const r = ecrire(null, cree, ctx);
      if (nouveauClient) s.clients.push(nouveauClient);
      if (nouveauVehicule) s.vehicules.push(nouveauVehicule);
      s.interventions.push(r.apres);
      this.appliquer(s, vehiculeId, r.consequences);
      creeId = cree.id;
    });
    if (n.dejaAuGarage) {
      // La voiture est déjà là : la réception est une seconde écriture (J1),
      // comme sur Supabase. La fiche existe quoi qu’il arrive.
      try {
        await this.changerStatut(creeId, 'recu', auteurId);
      } catch (e) {
        throw new ReceptionEchouee(this.copieIntervention(creeId), e);
      }
    }
    return this.copieIntervention(creeId);
  }

  private copieIntervention(id: string): Intervention {
    const i = this.snap?.interventions.find((x) => x.id === id);
    if (!i) throw new Error('Intervention introuvable.');
    return structuredClone(i);
  }

  async changerStatut(
    id: string,
    vers: Statut,
    auteurId: string,
    o?: { motif?: MotifAnnulation; debut?: string; dureeMin?: number },
  ) {
    await this.ecrireEtPersister(id, auteurId, (i) => ({
      ...i,
      statut: vers,
      ...(vers === 'annule' && o?.motif ? { motifAnnulation: o.motif } : {}),
      ...(o?.debut ? { debut: o.debut } : {}),
      ...(o?.dureeMin ? { dureeMin: o.dureeMin } : {}),
    }));
  }

  async changerBlocage(id: string, vers: Blocage | null, auteurId: string, detail?: DetailBlocage) {
    await this.ecrireEtPersister(id, auteurId, (i) => {
      const x: Intervention = { ...i, blocage: vers };
      // Sans détail fourni, celui d’un blocage remplacé ou levé part avec lui ;
      // une précision (même blocage) le remplace.
      if (detail !== undefined) x.detailBlocage = detail;
      else if (vers !== i.blocage) delete x.detailBlocage;
      return x;
    });
  }

  async affecter(id: string, membreId: string | null, auteurId: string) {
    await this.ecrireEtPersister(id, auteurId, (i) => ({ ...i, membreId }));
  }

  async modifierIntervention(id: string, patch: PatchIntervention) {
    await this.muter((s) => {
      // Le contrat ne porte pas l’auteur : c’est le membre connecté, comme auth.uid().
      const auteur = this.membre(s, this.membreId);
      this.ecrireIntervention(s, id, this.membreId, (i) => {
        const x: Record<string, unknown> = { ...i };
        for (const [cle, valeur] of Object.entries(patch)) {
          if (valeur === undefined) continue;
          // Comme 0006 : sans « Voir les montants », le montant envoyé est ignoré.
          if (cle === 'montantEstime' && auteur && !permissionsDe(auteur).voirPrix) continue;
          if (valeur === null) delete x[cle];
          else x[cle] = valeur;
        }
        return x as Intervention;
      });
    });
  }

  /**
   * Comme la RPC `noter_accord` : refus R10 à R12, une seule écriture
   * (colonnes d’accord, montant seulement avec « Voir les montants », levée)
   * en mode « accord », qui produit accord, montant et levée (J6) puis N6.
   */
  async noterAccord(id: string, a: { de: string; canal: CanalAccord; montant?: number }, auteurId: string) {
    await this.muter((s) => {
      const auteur = this.membre(s, auteurId);
      this.ecrireIntervention(s, id, auteurId, (i, t) => appliquerAccord(i, a, auteur, t), 'accord');
    });
  }

  async marquerPrevenu(id: string, canal: CanalPrevenu, auteurId: string) {
    await this.ecrireEtPersister(id, auteurId, (i, t) => ({ ...i, prevenu: { canal, le: t.toISOString(), par: auteurId } }));
  }

  async marquerDevisEnvoye(id: string, auteurId: string) {
    await this.ecrireEtPersister(id, auteurId, (i, t) => ({ ...i, devisEnvoyeLe: t.toISOString() }));
  }

  /**
   * « Annuler » de l’avis (J14) : rétablit l’état d’avant, supprime
   * l’événement avec sa note automatique et ses notifications, réaffiche les
   * étapes masquées ; si le SMS « prêt » était parti, publie la phrase
   * explicative pour le client.
   */
  async annulerDernierChangement(id: string, auteurId: string, evenementId?: string): Promise<ResultatAnnulation> {
    let resultat!: ResultatAnnulation;
    await this.muter((s) => {
      const idx = s.interventions.findIndex((x) => x.id === id);
      if (idx < 0) throw new Error('Intervention introuvable.');
      const t = new Date();
      const i = s.interventions[idx];
      const r = annulation(structuredClone(i), this.contexte(s, i, auteurId, t, 'annulation'), evenementId);
      s.interventions[idx] = { ...r.apres, majLe: t.toISOString() };
      s.evenements = s.evenements.filter((e) => e.id !== r.supprimer);
      s.commentaires = s.commentaires.filter((k) => k.evenementId !== r.supprimer);
      s.notifications = s.notifications.filter((n) => n.evenementId !== r.supprimer);
      const evenements = new Set(r.reafficher.evenements);
      const commentaires = new Set(r.reafficher.commentaires);
      for (const e of s.evenements) if (evenements.has(e.id)) e.visibleClient = true;
      for (const k of s.commentaires) if (commentaires.has(k.id)) k.visibleClient = true;
      if (r.noteClient) {
        const auteur = this.membre(s, auteurId);
        s.commentaires.push({
          id: uid('k'),
          interventionId: id,
          auteurId,
          auteurNom: auteur?.prenom ?? 'Garage',
          texte: r.noteClient,
          visibleClient: true,
          photos: [],
          creeLe: t.toISOString(),
          // Comme le SQL : phrase du serveur, sans événement, qui ne se retire pas.
          automatique: true,
        });
      }
      resultat = r.resultat;
    });
    return resultat;
  }

  /**
   * Retire une note de la page du client (P1). Mêmes contrôles que la RLS
   * (auteur ou gérant) puis que le trigger `commentaires_retrait` de 0014.
   */
  async retirerNote(commentaireId: string, auteurId: string) {
    await this.muter((s) => {
      const k = s.commentaires.find((x) => x.id === commentaireId);
      const qui = this.membre(s, auteurId);
      const t = new Date();
      // Note introuvable ou d’un autre : la RLS ne la laisse pas toucher (même message).
      if (!k) throw new Error(REFUS.RETRAIT_AUTEUR);
      const refusAuteur = refusRetraitNote(k, qui, t);
      if (refusAuteur === REFUS.RETRAIT_AUTEUR) throw new Error(refusAuteur);
      // Déjà retirée, ou note d’équipe : rien à faire (comme l’update côté serveur).
      if (!aRetirer(k)) return;
      if (refusAuteur) throw new Error(refusAuteur);
      k.visibleClient = false;
      k.retireeLe = t.toISOString();
      k.retireePar = qui?.id ?? null;
    });
  }

  async commenter(c: Parameters<Repo['commenter']>[0]): Promise<Commentaire> {
    let cree!: Commentaire;
    await this.muter((s) => {
      const auteur = s.membres.find((m) => m.id === c.auteurId);
      cree = {
        id: uid('k'),
        interventionId: c.interventionId,
        auteurId: c.auteurId,
        auteurNom: auteur?.prenom ?? 'Garage',
        texte: c.texte,
        visibleClient: c.visibleClient,
        photos: (c.photos ?? []).map((p) => ({ id: uid('p'), uri: p.uri, video: p.video })),
        creeLe: maintenant(),
      };
      s.commentaires.push(cree);
      const i = s.interventions.find((x) => x.id === c.interventionId);
      if (i) i.majLe = cree.creeLe;
    });
    return structuredClone(cree);
  }

  async envoyerSmsPret(interventionId: string, auteurId: string, texte: string) {
    // Journal du texte tel qu’il serait parti (normalisé, comme la fonction Edge `sms`).
    const envoye = normaliserSms(texte);
    await this.muter((s) => {
      // Après le passage en « Prêt » qu’il annonce, même sous une horloge figée.
      const creeLe = this.instant(s, interventionId).toISOString();
      s.evenements.push({ id: uid('e'), interventionId, membreId: auteurId, type: 'sms', valeur: envoye, creeLe });
    });
  }

  // ── Clients et véhicules

  async creerClient(c: Parameters<Repo['creerClient']>[0]) {
    const cree = { id: uid('c'), garageId: (await this.lire()).garage.id, creeLe: maintenant(), ...c };
    await this.muter((s) => {
      s.clients.push(cree);
    });
    return cree;
  }

  async modifierClient(id: string, patch: Parameters<Repo['modifierClient']>[1]) {
    await this.muter((s) => {
      const c = s.clients.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
    });
  }

  async creerVehicule(v: Parameters<Repo['creerVehicule']>[0]) {
    const cree = { id: uid('v'), garageId: (await this.lire()).garage.id, origineDonnees: 'saisie' as const, ...v };
    await this.muter((s) => {
      s.vehicules.push(cree);
    });
    return cree;
  }

  async modifierVehicule(id: string, patch: Parameters<Repo['modifierVehicule']>[1]) {
    await this.muter((s) => {
      const v = s.vehicules.find((x) => x.id === id);
      if (v) Object.assign(v, patch);
    });
  }

  // ── Appels

  async validerAppel(appelId: string, auteurId: string) {
    let resultat: Intervention | null = null;
    await this.muter((s) => {
      const a = s.appels.find((x) => x.id === appelId);
      if (!a?.interventionId) return;
      const i = s.interventions.find((x) => x.id === a.interventionId);
      if (!i) return;
      resultat = i.statut === 'a_valider' ? this.ecrireIntervention(s, i.id, auteurId, (x) => ({ ...x, statut: 'planifie' })) : i;
    });
    return resultat ? structuredClone(resultat) : null;
  }

  async ignorerAppel(appelId: string) {
    await this.muter((s) => {
      const a = s.appels.find((x) => x.id === appelId);
      if (!a?.interventionId) return;
      const i = s.interventions.find((x) => x.id === a.interventionId);
      // Fiche du réceptionniste ignorée : sans motif ni phrase client (J1.a).
      if (i && i.statut === 'a_valider') this.ecrireIntervention(s, i.id, this.membreId, (x) => ({ ...x, statut: 'annule' }));
    });
  }

  async lierAppel(appelId: string, interventionId: string) {
    await this.muter((s) => {
      const a = s.appels.find((x) => x.id === appelId);
      if (a) a.interventionId = interventionId;
    });
  }

  /** Mêmes règles que renvoi_receptionniste() (0017) ; tous les appels de la démo arrivent « par le réseau ». */
  async renvoiReceptionniste(): Promise<RenvoiReceptionniste | null> {
    const s = await this.lire();
    const moi = s.membres.find((m) => m.id === this.membreId && m.actif);
    if (!moi || !peut(moi, 'appels')) return null;
    const dernier = s.appels.reduce<string | null>((d, a) => (d === null || a.debut > d ? a.debut : d), null);
    return { numero: NUMERO_RENCAR_DEMO, dernierAppelLe: dernier };
  }

  async ecouteAppel(appelId: string): Promise<EcouteAppel | null> {
    const appel = (await this.lire()).appels.find((x) => x.id === appelId);
    return appel ? ecouteDemo(appel) : null;
  }

  // ── Notifications

  async marquerLue(id: string) {
    await this.muter((s) => {
      const n = s.notifications.find((x) => x.id === id);
      if (n) n.lue = true;
    });
  }

  /** Celles du membre et celles du garage, comme côté Supabase : jamais celles d’un collègue. */
  async toutMarquerLu(membreId: string) {
    await this.muter((s) => {
      s.notifications.forEach((n) => {
        if (n.membreId === null || n.membreId === membreId) n.lue = true;
      });
    });
  }

  async enregistrerJetonPush() {
    // Démo : pas de serveur.
  }

  // ── Sonnerie dans l'app (démonstration : réglage gardé sur le téléphone, appels simulés)

  private async inscriptionsSonnerie(): Promise<string[]> {
    try {
      const brut = await AsyncStorage.getItem(CLE_SONNERIE);
      const v: unknown = brut ? JSON.parse(brut) : [];
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  private async ecrireInscriptions(liste: string[]) {
    try {
      await AsyncStorage.setItem(CLE_SONNERIE, JSON.stringify(liste));
    } catch {
      // en démo, une écriture ratée n'est pas bloquante
    }
  }

  async sonnerieInscrite(appareil: string) {
    return (await this.inscriptionsSonnerie()).includes(`${this.membreId}:${appareil}`);
  }

  async inscrireSonnerie(appareil: string) {
    const cle = `${this.membreId}:${appareil}`;
    const liste = await this.inscriptionsSonnerie();
    if (!liste.includes(cle)) await this.ecrireInscriptions([...liste, cle]);
  }

  async retirerSonnerie(appareil: string) {
    const cle = `${this.membreId}:${appareil}`;
    await this.ecrireInscriptions((await this.inscriptionsSonnerie()).filter((x) => x !== cle));
  }

  async jetonVoix() {
    // Démo : aucun serveur Twilio, les appels sont simulés (lib/sonnerie/simulateur.ts).
    return null;
  }

  async testerSonnerie() {
    // Démo : l'essai est simulé sur le téléphone.
  }

  /**
   * Démonstration seulement (hors contrat Repo) : fait avancer le passage d'un
   * appel à l'équipe comme le feraient les rappels de Twilio, pour montrer la
   * carte en direct et l'écran d'appel sans serveur.
   */
  async simulerTransfert(appelId: string, etat: EtatTransfert, o: { membreId?: string; dureeSec?: number } = {}) {
    await this.muter((s) => {
      const a = s.appels.find((x) => x.id === appelId);
      if (!a) return;
      const maintenant = new Date().toISOString();
      if (etat === 'sonne') {
        a.transfert = { etat, le: maintenant };
        return;
      }
      const t = a.transfert ?? { etat, le: maintenant };
      if (etat === 'en_ligne') {
        a.transfert = { ...t, etat, prisPar: o.membreId, prisLe: maintenant };
        a.issue = 'transfere';
        // Le réceptionniste a passé la main : son compte rendu arrive pendant la conversation.
        a.enCours = false;
        return;
      }
      a.transfert = { ...t, etat, finLe: maintenant, dureeSec: o.dureeSec };
      a.enCours = false;
      if (etat === 'termine') a.issue = 'transfere';
      if (etat === 'sans_reponse') {
        if (a.issue === 'renseignement') a.issue = 'rappel_demande';
        const prenom = (a.contexte?.champs.prenom?.valeur ?? a.appelant ?? '').trim().split(' ')[0];
        s.notifications.unshift({
          id: uid('n'),
          garageId: s.garage.id,
          membreId: null,
          type: 'ia',
          titre: 'Appel non décroché',
          detail: prenom ? `${prenom} souhaite être rappelé` : 'Un appelant souhaite être rappelé',
          cible: { type: 'appel', id: a.id },
          lue: false,
          creeLe: maintenant,
        });
      }
    });
  }

  // ── Équipe et réglages

  async inviterMembre(n: NouveauMembre): Promise<Membre> {
    let cree!: Membre;
    await this.muter((s) => {
      cree = {
        id: uid('m'),
        garageId: s.garage.id,
        prenom: n.prenom,
        nom: n.nom,
        email: n.email,
        role: n.role,
        poste: n.poste,
        permissions: n.role === 'gerant' ? TOUTES_PERMISSIONS : n.permissions ?? POSTES[n.poste].permissions,
        couleur: COULEURS[s.membres.length % COULEURS.length],
        actif: true,
        invitationEnAttente: true,
      };
      s.membres.push(cree);
    });
    return cree;
  }

  async modifierMembre(id: string, patch: Parameters<Repo['modifierMembre']>[1]) {
    await this.muter((s) => {
      const m = s.membres.find((x) => x.id === id);
      if (m) Object.assign(m, patch);
    });
  }

  async modifierGarage(patch: Parameters<Repo['modifierGarage']>[0]) {
    await this.muter((s) => {
      const { options, ...reste } = patch;
      Object.assign(s.garage, reste);
      // Comme le serveur (garages_garde) : les prestations sont réglées par
      // Rencar, seule la préférence d'envoi automatique est au gérant.
      if (options) {
        s.garage.options = { ...s.garage.options, smsAutomatique: options.smsAutomatique ?? s.garage.options.smsAutomatique };
      }
    });
  }
}
