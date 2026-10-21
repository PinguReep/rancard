/**
 * Implémentation « démo » du contrat Repo : tout vit sur le téléphone.
 *
 * Persistance : AsyncStorage (une seule clé JSON) qui garde l'instantané,
 * le jour de sa génération et un drapeau « modifié ». Le garage de
 * démonstration est réinjecté si le stockage est vide, d'une version
 * antérieure, ou si le jour a changé sans que l'utilisateur ait rien touché
 * (les dates du seed sont relatives à « aujourd'hui »).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { differenceInMinutes, isSameDay } from 'date-fns';

import { POSTES, TOUTES_PERMISSIONS } from '@/domain/permissions';
import type { Blocage, Commentaire, Intervention, Membre, Session, Statut } from '@/domain/types';
import { STATUTS } from '@/domain/statuts';
import type { Identifiants, NouveauMembre, NouvelleIntervention, Repo, Snapshot } from '@/data/repo';

import { DEMO_MEMBRE_ID, snapshotDemo } from './seed';

const CLE = 'atelier.demo.v2';
const CLE_SESSION = 'atelier.demo.session.v1';

type Stockage = { genereLe: string; modifie: boolean; snapshot: Snapshot };

const uid = (prefixe: string) => `${prefixe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const maintenant = () => new Date().toISOString();

const COULEURS = ['#2f6bff', '#d92632', '#1f9d55', '#d98b00', '#7c3aed', '#0891b2'];

/** Un appel « en cours » depuis plus de dix minutes est terminé (instantané d'un autre jour). */
function cloreAppelsAnciens(s: Snapshot) {
  const now = new Date();
  for (const a of s.appels) {
    if (a.enCours && differenceInMinutes(now, new Date(a.debut)) > 10) a.enCours = false;
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

  /** Applique une mutation puis persiste et notifie. */
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

  // ── Session

  async sessionCourante(): Promise<Session | null> {
    const s = await this.lire();
    if (!this.membreId) {
      try {
        this.membreId = await AsyncStorage.getItem(CLE_SESSION);
      } catch {
        this.membreId = null;
      }
    }
    const membre = s.membres.find((m) => m.id === this.membreId && m.actif);
    return membre ? { membre, garage: s.garage } : null;
  }

  async connecter(id: Identifiants): Promise<Session> {
    const s = await this.lire();
    const membre = s.membres.find((m) => m.email.toLowerCase() === id.email.trim().toLowerCase() && m.actif);
    // En démo, n'importe quel mot de passe ouvre un compte existant.
    if (!membre) throw new Error('Aucun compte avec cette adresse dans le garage de démonstration.');
    return this.ouvrir(membre, s);
  }

  async connecterDemo(): Promise<Session> {
    const s = await this.lire();
    const membre = s.membres.find((m) => m.id === DEMO_MEMBRE_ID) ?? s.membres[0];
    return this.ouvrir(membre, s);
  }

  private async ouvrir(membre: Membre, s: Snapshot): Promise<Session> {
    this.membreId = membre.id;
    try {
      await AsyncStorage.setItem(CLE_SESSION, membre.id);
    } catch {
      // ignoré
    }
    return { membre, garage: s.garage };
  }

  async deconnecter() {
    this.membreId = null;
    try {
      await AsyncStorage.removeItem(CLE_SESSION);
    } catch {
      // ignoré
    }
  }

  async demanderReinitialisation() {
    // Démo : rien à envoyer.
  }

  async changerMotDePasse() {
    // Démo : pas de mot de passe.
  }

  async supprimerMonCompte() {
    const id = this.membreId;
    await this.muter((s) => {
      const m = s.membres.find((x) => x.id === id);
      if (m) m.actif = false;
    });
    await this.deconnecter();
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
    let cree!: Intervention;
    await this.muter((s) => {
      const garageId = s.garage.id;
      const clientId =
        'id' in n.client
          ? n.client.id
          : (() => {
              const c = { id: uid('c'), garageId, creeLe: maintenant(), ...n.client };
              s.clients.push(c);
              return c.id;
            })();
      const vehiculeId =
        'id' in n.vehicule
          ? n.vehicule.id
          : (() => {
              const v = { id: uid('v'), garageId, clientId, origineDonnees: 'saisie' as const, ...n.vehicule };
              s.vehicules.push(v);
              return v.id;
            })();
      const t = maintenant();
      cree = {
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
        memo: n.memo,
        montantEstime: n.montantEstime,
        suiviToken: uid('s'),
        creeLe: t,
        majLe: t,
      };
      s.interventions.push(cree);
      s.evenements.push({ id: uid('e'), interventionId: cree.id, membreId: auteurId, type: 'creation', valeur: n.origine, creeLe: t });
    });
    return cree;
  }

  /**
   * Un seul chemin pour changer un statut : événement dans le journal et
   * étape visible par le client. Utilisé par changerStatut, validerAppel et
   * ignorerAppel pour que le fil, l'activité et la page de suivi voient
   * toutes les transitions.
   */
  private passerStatut(s: Snapshot, i: Intervention, vers: Statut, auteurId: string | null) {
    i.statut = vers;
    if (vers === 'livre' || vers === 'annule' || vers === 'termine') i.blocage = null;
    i.majLe = maintenant();
    s.evenements.push({ id: uid('e'), interventionId: i.id, membreId: auteurId, type: 'statut', valeur: vers, creeLe: i.majLe });
    // Le client suit les grandes étapes : on ajoute automatiquement une étape visible.
    const auteur = auteurId ? s.membres.find((m) => m.id === auteurId) : undefined;
    s.commentaires.push({
      id: uid('k'),
      interventionId: i.id,
      auteurId,
      auteurNom: auteur?.prenom ?? 'Garage',
      texte: STATUTS[vers].client,
      visibleClient: true,
      photos: [],
      creeLe: i.majLe,
    });
  }

  async changerStatut(id: string, vers: Statut, auteurId: string) {
    await this.muter((s) => {
      const i = s.interventions.find((x) => x.id === id);
      if (i) this.passerStatut(s, i, vers, auteurId);
    });
  }

  async changerBlocage(id: string, vers: Blocage | null, auteurId: string) {
    await this.muter((s) => {
      const i = s.interventions.find((x) => x.id === id);
      if (!i) return;
      i.blocage = vers;
      i.majLe = maintenant();
      s.evenements.push({ id: uid('e'), interventionId: id, membreId: auteurId, type: 'blocage', valeur: vers, creeLe: i.majLe });
    });
  }

  async affecter(id: string, membreId: string | null, auteurId: string) {
    await this.muter((s) => {
      const i = s.interventions.find((x) => x.id === id);
      if (!i) return;
      i.membreId = membreId;
      i.majLe = maintenant();
      s.evenements.push({ id: uid('e'), interventionId: id, membreId: auteurId, type: 'affectation', valeur: membreId, creeLe: i.majLe });
    });
  }

  async modifierIntervention(id: string, patch: Parameters<Repo['modifierIntervention']>[1]) {
    await this.muter((s) => {
      const i = s.interventions.find((x) => x.id === id);
      if (!i) return;
      Object.assign(i, patch, { majLe: maintenant() });
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
    return cree;
  }

  async envoyerSmsPret(interventionId: string, auteurId: string, texte: string) {
    await this.muter((s) => {
      s.evenements.push({ id: uid('e'), interventionId, membreId: auteurId, type: 'sms', valeur: texte, creeLe: maintenant() });
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
      if (i.statut === 'a_valider') this.passerStatut(s, i, 'planifie', auteurId);
      resultat = i;
    });
    return resultat;
  }

  async ignorerAppel(appelId: string) {
    await this.muter((s) => {
      const a = s.appels.find((x) => x.id === appelId);
      if (!a?.interventionId) return;
      const i = s.interventions.find((x) => x.id === a.interventionId);
      if (i && i.statut === 'a_valider') this.passerStatut(s, i, 'annule', this.membreId);
    });
  }

  async lierAppel(appelId: string, interventionId: string) {
    await this.muter((s) => {
      const a = s.appels.find((x) => x.id === appelId);
      if (a) a.interventionId = interventionId;
    });
  }

  // ── Notifications

  async marquerLue(id: string) {
    await this.muter((s) => {
      const n = s.notifications.find((x) => x.id === id);
      if (n) n.lue = true;
    });
  }

  async toutMarquerLu() {
    await this.muter((s) => {
      s.notifications.forEach((n) => {
        n.lue = true;
      });
    });
  }

  async enregistrerJetonPush() {
    // Démo : pas de serveur.
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
      Object.assign(s.garage, patch);
    });
  }
}
