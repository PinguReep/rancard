/**
 * Garage de démonstration.
 *
 * ⚠️ Tout est fictif : noms, plaques, numéros. Les dates sont calculées par
 * rapport à aujourd'hui pour que la démo reste « vivante » quel que soit le
 * jour où on l'ouvre. Rien n'est connecté à un système réel.
 */

import { addDays, addMinutes, setHours, setMinutes, startOfDay, subDays, subMinutes } from 'date-fns';

import { POSTES, TOUTES_PERMISSIONS } from '@/domain/permissions';
import type { Snapshot } from '@/data/repo';
import type {
  Appel,
  Client,
  Commentaire,
  Evenement,
  Garage,
  Intervention,
  Membre,
  MessageClient,
  Notification,
  Vehicule,
} from '@/domain/types';

const GARAGE_ID = 'demo-garage';

const jour = (offset: number, h: number, m = 0) =>
  setMinutes(setHours(startOfDay(addDays(new Date(), offset)), h), m).toISOString();

const avant = (jours: number, h: number, m = 0) =>
  setMinutes(setHours(startOfDay(subDays(new Date(), jours)), h), m).toISOString();

/** Il y a n minutes : pour les événements « d'aujourd'hui », jamais dans le futur. */
const depuis = (minutes: number) => subMinutes(new Date(), minutes).toISOString();

/** Prochain lundi (jamais aujourd’hui) à h:m : la livraison du kit « annoncée lundi matin » (k4). */
const prochainLundi = (h: number, m = 0) => {
  const ecart = (8 - new Date().getDay()) % 7 || 7;
  return jour(ecart, h, m);
};

/** Aujourd'hui à h:m, borné à maintenant si l'heure n'est pas encore passée. */
const aujourdhuiAuPlusTard = (h: number, m = 0) => {
  const iso = jour(0, h, m);
  const maintenant = new Date().toISOString();
  return iso > maintenant ? maintenant : iso;
};

export const garageDemo: Garage = {
  id: GARAGE_ID,
  nom: 'Garage de démonstration',
  adresse: '1 rue de l’Exemple, 99001 Villefictive',
  telephone: '01 99 00 00 10',
  expediteurSms: 'RENCAR',
  horaires: {
    0: null,
    1: { de: '08:00', a: '18:30' },
    2: { de: '08:00', a: '18:30' },
    3: { de: '08:00', a: '18:30' },
    4: { de: '08:00', a: '18:30' },
    5: { de: '08:00', a: '18:30' },
    6: { de: '09:00', a: '12:00' },
  },
  options: { site: true, sms: true, receptionniste: true, smsAutomatique: false, redactionIa: false },
  texteSmsPret:
    'Bonjour {prenom}, votre véhicule vous attend. Vous pouvez venir le récupérer aux horaires d’ouverture. {garage}',
};

export const membresDemo: Membre[] = [
  {
    id: 'm-simon',
    garageId: GARAGE_ID,
    prenom: 'Simon',
    nom: 'Moreau',
    email: 'simon@garage.example',
    role: 'gerant',
    poste: 'chef_atelier',
    permissions: TOUTES_PERMISSIONS,
    couleur: '#2f6bff',
    actif: true,
  },
  {
    id: 'm-adrien',
    garageId: GARAGE_ID,
    prenom: 'Adrien',
    nom: 'Martin',
    email: 'adrien@garage.example',
    role: 'gerant',
    poste: 'chef_atelier',
    permissions: TOUTES_PERMISSIONS,
    couleur: '#d92632',
    actif: true,
  },
  {
    id: 'm-elias',
    garageId: GARAGE_ID,
    prenom: 'Elias',
    nom: 'Durand',
    email: 'elias@garage.example',
    role: 'employe',
    poste: 'mecanicien',
    permissions: POSTES.mecanicien.permissions,
    couleur: '#1a7f45',
    actif: true,
  },
];

export const clientsDemo: Client[] = [
  { id: 'c1', garageId: GARAGE_ID, prenom: 'Élodie', nom: 'Masson', telephone: '06 39 98 00 12', memo: 'Commerçante dans la rue, préfère être appelée après 18h.', creeLe: avant(240, 10) },
  { id: 'c2', garageId: GARAGE_ID, prenom: 'Yassine', nom: 'Cherif', telephone: '06 39 98 00 13', memo: 'Client régulier depuis 2021.', creeLe: avant(500, 10) },
  { id: 'c3', garageId: GARAGE_ID, prenom: 'Manon', nom: 'Lefèvre', telephone: '06 39 98 00 14', email: 'manon.lefevre@example.fr', creeLe: avant(180, 10) },
  { id: 'c4', garageId: GARAGE_ID, prenom: 'Antoine', nom: 'Girard', telephone: '06 39 98 00 15', creeLe: avant(300, 10) },
  { id: 'c5', garageId: GARAGE_ID, prenom: 'Sophie', nom: 'Lambert', telephone: '06 39 98 00 16', creeLe: avant(170, 10) },
  { id: 'c6', garageId: GARAGE_ID, prenom: 'Hugo', nom: 'Bertin', telephone: '06 39 98 00 17', creeLe: avant(60, 10) },
  { id: 'c7', garageId: GARAGE_ID, prenom: 'Nicolas', nom: 'Fabre', telephone: '06 39 98 00 18', creeLe: depuis(46) },
];

export const vehiculesDemo: Vehicule[] = [
  { id: 'v1', garageId: GARAGE_ID, clientId: 'c1', plaque: 'AA-001-AA', marque: 'Peugeot', modele: '308', version: '1.2 PureTech', annee: 2018, km: 92300, origineDonnees: 'saisie' },
  { id: 'v2', garageId: GARAGE_ID, clientId: 'c2', plaque: 'AA-002-AA', marque: 'BMW', modele: 'Série 1', version: '118d (F20)', annee: 2013, km: 171500, origineDonnees: 'saisie' },
  { id: 'v3', garageId: GARAGE_ID, clientId: 'c3', plaque: 'AA-003-AA', marque: 'Audi', modele: 'A4', version: '2.0 TDI (B8)', annee: 2015, km: 128700, origineDonnees: 'saisie' },
  { id: 'v4', garageId: GARAGE_ID, clientId: 'c4', plaque: 'AA-004-AA', marque: 'Volkswagen', modele: 'Polo', version: '1.4 TDI', annee: 2016, km: 156400, origineDonnees: 'saisie' },
  { id: 'v5', garageId: GARAGE_ID, clientId: 'c5', plaque: 'AA-005-AA', marque: 'Toyota', modele: 'Yaris', version: '1.5 Hybride', annee: 2019, km: 64200, origineDonnees: 'saisie' },
  { id: 'v6', garageId: GARAGE_ID, clientId: 'c6', plaque: 'AA-006-AA', marque: 'Renault', modele: 'Mégane III', version: '1.5 dCi', annee: 2014, km: 151800, origineDonnees: 'saisie' },
  { id: 'v7', garageId: GARAGE_ID, clientId: 'c7', plaque: 'AA-007-AA', marque: 'Dacia', modele: 'Sandero', version: '1.0 SCe', annee: 2020, km: 38600, origineDonnees: 'saisie' },
];

export const interventionsDemo: Intervention[] = [
  {
    id: 'i1', garageId: GARAGE_ID, clientId: 'c1', vehiculeId: 'v1',
    prestation: 'Vidange + filtres', statut: 'en_cours', blocage: null, origine: 'site',
    membreId: 'm-simon', prioritaire: false, debut: jour(0, 8, 30), dureeMin: 60,
    restitutionPrevue: jour(0, 11), memo: 'Préfère être appelée après 18h.', montantEstime: 149,
    suiviToken: 'demo-i1', creeLe: avant(3, 9), majLe: jour(0, 9, 15), kmDepot: 87400,
  },
  {
    id: 'i2', garageId: GARAGE_ID, clientId: 'c2', vehiculeId: 'v2',
    prestation: 'Courroie de distribution', statut: 'en_cours', blocage: 'attente_piece', origine: 'telephone',
    membreId: 'm-adrien', prioritaire: true, debut: jour(-2, 8, 30), dureeMin: 480,
    restitutionPrevue: jour(2, 17), memo: 'Véhicule indispensable pour son travail, à rendre au plus vite.', montantEstime: 1290,
    suiviToken: 'demo-i2', creeLe: avant(6, 10), majLe: jour(-1, 8, 5), kmDepot: 164900,
    // Même information que la note k4 (« livraison annoncée lundi matin »), non annoncée au client
    detailBlocage: { quoi: 'Kit chaîne de distribution', pour: prochainLundi(9) },
  },
  {
    id: 'i3', garageId: GARAGE_ID, clientId: 'c3', vehiculeId: 'v3',
    prestation: 'Freins avant', statut: 'en_cours', blocage: 'attente_accord', origine: 'ia',
    membreId: 'm-simon', prioritaire: false, debut: jour(0, 10), dureeMin: 120,
    restitutionPrevue: jour(0, 17), memo: 'Devis envoyé à 9h40, relance prévue en début d’après-midi.', montantEstime: 389,
    suiviToken: 'demo-i3', creeLe: avant(2, 9, 47), majLe: jour(0, 9, 47), kmDepot: 112300,
    // Même information que les notes k6 et k7 (devis transmis ce matin)
    detailBlocage: { quoi: 'Disques et plaquettes avant' },
    devisEnvoyeLe: aujourdhuiAuPlusTard(9, 47),
  },
  {
    id: 'i4', garageId: GARAGE_ID, clientId: 'c4', vehiculeId: 'v4',
    prestation: 'Diagnostic électronique', statut: 'planifie', blocage: null, origine: 'site',
    membreId: 'm-elias', prioritaire: false, debut: jour(0, 11), dureeMin: 60,
    restitutionPrevue: jour(0, 13), demande: 'Voyant orange au tableau de bord depuis le week-end, ralenti instable.',
    montantEstime: 69, suiviToken: 'demo-i4', creeLe: avant(0, 7, 50), majLe: avant(0, 7, 50),
  },
  {
    id: 'i5', garageId: GARAGE_ID, clientId: 'c5', vehiculeId: 'v5',
    prestation: 'Entretien climatisation', statut: 'termine', blocage: null, origine: 'comptoir',
    membreId: 'm-elias', prioritaire: false, debut: jour(0, 9), dureeMin: 45,
    restitutionPrevue: jour(0, 10, 30), memo: 'Récupère le véhicule vers 17h.', montantEstime: 89,
    suiviToken: 'demo-i5', creeLe: avant(1, 16), majLe: jour(0, 10, 34), kmDepot: 76850,
  },
  {
    id: 'i6', garageId: GARAGE_ID, clientId: 'c6', vehiculeId: 'v6',
    prestation: 'Amortisseurs avant', statut: 'livre', blocage: null, origine: 'site',
    membreId: 'm-adrien', prioritaire: false, debut: jour(-1, 8), dureeMin: 180,
    restitutionPrevue: jour(-1, 16), montantEstime: 420,
    suiviToken: 'demo-i6', creeLe: avant(8, 12), majLe: jour(-1, 16, 5), kmDepot: 141200,
  },
  {
    id: 'i7', garageId: GARAGE_ID, clientId: 'c7', vehiculeId: 'v7',
    prestation: 'Batterie', statut: 'a_valider', blocage: null, origine: 'ia',
    membreId: null, prioritaire: false, debut: jour(1, 8, 30), dureeMin: 45,
    demande: 'Démarrage difficile depuis deux jours, batterie d’origine. Souhaite un contrôle rapide.',
    suiviToken: 'demo-i7', creeLe: depuis(46), majLe: depuis(46),
  },
  {
    id: 'i8', garageId: GARAGE_ID, clientId: 'c3', vehiculeId: 'v3',
    prestation: 'Vidange', statut: 'livre', blocage: null, origine: 'comptoir',
    membreId: 'm-simon', prioritaire: false, debut: avant(180, 9), dureeMin: 60, montantEstime: 129,
    suiviToken: 'demo-i8', creeLe: avant(182, 9), majLe: avant(180, 11), kmDepot: 98750,
  },
  {
    id: 'i9', garageId: GARAGE_ID, clientId: 'c2', vehiculeId: 'v2',
    prestation: 'Kit embrayage', statut: 'livre', blocage: null, origine: 'telephone',
    membreId: 'm-adrien', prioritaire: false, debut: avant(140, 8, 30), dureeMin: 480, montantEstime: 1480,
    suiviToken: 'demo-i9', creeLe: avant(145, 9), majLe: avant(139, 17), kmDepot: 158300,
  },
  {
    id: 'i10', garageId: GARAGE_ID, clientId: 'c1', vehiculeId: 'v1',
    prestation: 'Plaquettes arrière', statut: 'livre', blocage: null, origine: 'site',
    membreId: 'm-simon', prioritaire: false, debut: avant(220, 9), dureeMin: 120, montantEstime: 310,
    suiviToken: 'demo-i10', creeLe: avant(223, 9), majLe: avant(220, 12), kmDepot: 79600,
  },
  {
    id: 'i11', garageId: GARAGE_ID, clientId: 'c4', vehiculeId: 'v4',
    prestation: 'Révision complète', statut: 'planifie', blocage: null, origine: 'site',
    membreId: null, prioritaire: false, debut: jour(2, 14), dureeMin: 180, montantEstime: 249,
    suiviToken: 'demo-i11', creeLe: avant(1, 18), majLe: avant(1, 18),
  },
];

export const commentairesDemo: Commentaire[] = [
  { id: 'k1', interventionId: 'i1', auteurId: 'm-simon', auteurNom: 'Simon', texte: 'Véhicule installé sur le pont, vidange en cours.', visibleClient: true, photos: [], creeLe: jour(0, 8, 42) },
  { id: 'k2', interventionId: 'i1', auteurId: 'm-simon', auteurNom: 'Simon', texte: 'Filtre à pollen à changer, je le propose au client.', visibleClient: false, photos: [], creeLe: jour(0, 9, 15) },
  { id: 'k3', interventionId: 'i2', auteurId: 'm-adrien', auteurNom: 'Adrien', texte: 'Courroie craquelée, galets bruyants : remplacement complet nécessaire.', visibleClient: true, photos: [], creeLe: jour(-2, 10, 20) },
  { id: 'k4', interventionId: 'i2', auteurId: 'm-adrien', auteurNom: 'Adrien', texte: 'Kit courroie et pompe à eau commandé, livraison prévue sous 48 h.', visibleClient: false, photos: [], creeLe: jour(-1, 8, 5) },
  { id: 'k5', interventionId: 'i2', auteurId: 'm-simon', auteurNom: 'Simon', texte: 'Client informé du délai par SMS, pas d’objection.', visibleClient: false, photos: [], creeLe: jour(-1, 16, 30) },
  { id: 'k6', interventionId: 'i3', auteurId: 'm-simon', auteurNom: 'Simon', texte: 'Disques sous la cote minimale, plaquettes usées. Photos jointes au devis.', visibleClient: true, photos: [], creeLe: jour(0, 9, 40) },
  { id: 'k7', interventionId: 'i3', auteurId: null, auteurNom: 'Réceptionniste', texte: 'Devis transmis par téléphone.', visibleClient: false, photos: [], creeLe: jour(0, 9, 47) },
  { id: 'k8', interventionId: 'i5', auteurId: 'm-elias', auteurNom: 'Elias', texte: 'Circuit contrôlé et rechargé, température en sortie correcte.', visibleClient: true, photos: [], creeLe: jour(0, 10, 34) },
  { id: 'k9', interventionId: 'i6', auteurId: 'm-adrien', auteurNom: 'Adrien', texte: 'Amortisseurs et coupelles changés, essai sur route concluant.', visibleClient: true, photos: [], creeLe: jour(-1, 15, 20) },
  { id: 'k10', interventionId: 'i6', auteurId: 'm-simon', auteurNom: 'Simon', texte: 'Véhicule rendu, facture remise au client.', visibleClient: false, photos: [], creeLe: jour(-1, 16, 5) },
];

export const evenementsDemo: Evenement[] = [
  { id: 'e1', interventionId: 'i1', membreId: null, type: 'creation', valeur: 'site', creeLe: avant(3, 9) },
  { id: 'e2', interventionId: 'i1', membreId: 'm-simon', type: 'statut', valeur: 'recu', creeLe: jour(0, 8, 25) },
  { id: 'e3', interventionId: 'i1', membreId: 'm-simon', type: 'statut', valeur: 'en_cours', creeLe: jour(0, 8, 40) },
  { id: 'e4', interventionId: 'i2', membreId: 'm-adrien', type: 'blocage', valeur: 'attente_piece', creeLe: jour(-1, 8, 5) },
  { id: 'e5', interventionId: 'i3', membreId: null, type: 'blocage', valeur: 'attente_accord', creeLe: jour(0, 9, 47) },
  { id: 'e6', interventionId: 'i5', membreId: 'm-elias', type: 'statut', valeur: 'termine', creeLe: jour(0, 10, 34) },
  { id: 'e7', interventionId: 'i5', membreId: 'm-elias', type: 'sms', valeur: 'Bonjour Sophie, votre véhicule est prêt, vous pouvez venir le récupérer aux horaires d’ouverture. Garage de démonstration', creeLe: jour(0, 10, 35) },
  { id: 'e8', interventionId: 'i6', membreId: 'm-simon', type: 'statut', valeur: 'livre', creeLe: jour(-1, 16, 5) },
  { id: 'e9', interventionId: 'i7', membreId: null, type: 'creation', valeur: 'ia', creeLe: depuis(46) },
];

export const appelsDemo: Appel[] = [
  {
    id: 'a0', garageId: GARAGE_ID, numero: '06 39 98 00 19', appelant: 'Hugo Girard', debut: addMinutes(new Date(), -1).toISOString(), dureeSec: 41,
    horsHoraires: false, enCours: true, issue: 'renseignement',
    resume: 'L’appelante signale un sifflement au freinage depuis deux jours. Le réceptionniste propose un contrôle des freins cette semaine.',
    contexte: {
      etape: 'vehicule',
      champs: {
        prenom: { valeur: 'Hugo', confirme: true },
        nom: { valeur: 'Girard', confirme: true },
        telephoneRappel: { valeur: '+33639980019', confirme: true },
        marque: { valeur: 'Renault', confirme: true },
        modele: { valeur: 'Mégane', confirme: false },
        motif: { valeur: 'Bruit de roulement à l’avant droit, plus fort en virage.', confirme: true },
      },
      majLe: new Date().toISOString(),
    },
  },
  {
    id: 'a1', garageId: GARAGE_ID, numero: '06 39 98 00 18', appelant: 'Nicolas Fabre', debut: depuis(47), dureeSec: 61,
    horsHoraires: false, enCours: false, issue: 'rdv_pris', interventionId: 'i7',
    resume: 'Démarrage difficile depuis deux jours, batterie d’origine. Souhaite un contrôle rapide. Le réceptionniste a proposé demain 8h30, accepté.',
  },
  {
    id: 'a2', garageId: GARAGE_ID, numero: '06 39 98 00 20', appelant: 'Clara Rousseau', debut: avant(1, 20, 2), dureeSec: 107,
    horsHoraires: true, enCours: false, issue: 'rappel_demande',
    resume: 'Demande un prix pour la courroie d’accessoires. Le réceptionniste a noté un rappel pour établir le devis.',
    // Nouvelle cliente : la fiche de l'appel préremplit le formulaire « Nouveau client » et le véhicule.
    contexte: {
      etape: 'cloture',
      champs: {
        prenom: { valeur: 'Clara', confirme: true },
        nom: { valeur: 'Rousseau', confirme: true },
        telephoneRappel: { valeur: '+33639980020', confirme: true },
        marque: { valeur: 'Volkswagen', confirme: true },
        modele: { valeur: 'Polo', confirme: true },
        immatriculation: { valeur: 'GK 218 VB', confirme: false },
        kilometrage: { valeur: '132000', confirme: true },
        motif: { valeur: 'Devis pour un embrayage, la pédale patine en côte depuis quelques jours.', confirme: true },
      },
      majLe: avant(1, 20, 3),
    },
  },
  {
    id: 'a3', garageId: GARAGE_ID, numero: '06 39 98 00 21', appelant: 'Gérard Collin', debut: aujourdhuiAuPlusTard(7, 48), dureeSec: 65,
    horsHoraires: true, enCours: false, issue: 'renseignement',
    resume: 'Voulait savoir si le garage fait la géométrie. Réponse donnée, pas de suite immédiate.',
  },
  {
    id: 'a4', garageId: GARAGE_ID, numero: '06 39 98 00 12', appelant: 'Élodie Masson', debut: avant(2, 18, 55), dureeSec: 182,
    horsHoraires: false, enCours: false, issue: 'rdv_pris', interventionId: 'i1',
    resume: 'Appelle pour décaler son rendez-vous de vidange d’une heure. Le réceptionniste a confirmé le nouvel horaire.',
  },
  {
    // Client connu : numéro et plaque retrouvés, la création s'ouvre directement sur l'étape Intervention.
    id: 'a5', garageId: GARAGE_ID, numero: '06 39 98 00 17', appelant: 'Hugo Bertin', debut: avant(3, 11, 12), dureeSec: 96,
    horsHoraires: false, enCours: false, issue: 'rappel_demande',
    resume: 'Pneus avant usés, souhaite un devis pour deux pneus et la géométrie. Le réceptionniste a noté un rappel.',
    contexte: {
      etape: 'cloture',
      champs: {
        prenom: { valeur: 'Hugo', confirme: true },
        nom: { valeur: 'Bertin', confirme: true },
        marque: { valeur: 'Renault', confirme: true },
        modele: { valeur: 'Clio', confirme: true },
        immatriculation: { valeur: 'AA-006-AA', confirme: true },
        kilometrage: { valeur: '143500', confirme: false },
        motif: { valeur: 'Pneus avant usés, devis pour deux pneus et la géométrie.', confirme: true },
      },
      majLe: avant(3, 11, 14),
    },
  },
];

/**
 * Messages écrits par les clients sur leur page de suivi (« Répondre au
 * garage », 0020). Yassine demande hier soir si sa BMW sera prête lundi :
 * personne ne lui a encore répondu (le fil propose « Répondre à Yassine »).
 */
export const messagesClientsDemo: MessageClient[] = [
  {
    id: 'mc1', garageId: GARAGE_ID, interventionId: 'i2',
    texte: 'Bonjour, la voiture sera-t-elle prête pour lundi ? J’en ai besoin pour aller travailler.\nMerci !',
    creeLe: avant(1, 19, 12),
  },
];

export const notificationsDemo: Notification[] = [
  { id: 'n1', garageId: GARAGE_ID, membreId: null, type: 'rdv_site', titre: 'Nouveau rendez-vous depuis le site', detail: 'Antoine Girard · Polo · Diagnostic électronique · aujourd’hui 11h', cible: { type: 'intervention', id: 'i4' }, lue: false, creeLe: addMinutes(new Date(), -4).toISOString() },
  { id: 'n2', garageId: GARAGE_ID, membreId: null, type: 'ia', titre: 'Le réceptionniste a créé une fiche', detail: 'Nicolas Fabre · Dacia Sandero · Batterie · demain 8h30', cible: { type: 'intervention', id: 'i7' }, lue: false, creeLe: depuis(45) },
  // Une par destinataire (titulaire, gérants) : celle de Simon, connecté en démonstration, puis celle d’Adrien.
  { id: 'n5', garageId: GARAGE_ID, membreId: 'm-simon', type: 'message_client', titre: 'Message du client : BMW Série 3', detail: 'Yassine a écrit depuis sa page de suivi à 19:12', cible: { type: 'intervention', id: 'i2' }, lue: false, creeLe: avant(1, 19, 12) },
  { id: 'n6', garageId: GARAGE_ID, membreId: 'm-adrien', type: 'message_client', titre: 'Message du client : BMW Série 3', detail: 'Yassine a écrit depuis sa page de suivi à 19:12', cible: { type: 'intervention', id: 'i2' }, lue: false, creeLe: avant(1, 19, 12) },
  { id: 'n4', garageId: GARAGE_ID, membreId: null, type: 'piece', titre: 'Livraison de pièce prévue', detail: 'Kit courroie de distribution BMW F20 · sous 48 h', cible: { type: 'intervention', id: 'i2' }, lue: true, creeLe: avant(1, 9) },
];

/**
 * Instantané neuf à chaque appel (copie profonde) : le dépôt de démonstration
 * mute les objets en place, « Réinitialiser » doit repartir d'exemplaires
 * intacts.
 */
export function snapshotDemo(): Snapshot {
  return structuredClone({
    garage: garageDemo,
    membres: membresDemo,
    clients: clientsDemo,
    vehicules: vehiculesDemo,
    interventions: interventionsDemo,
    commentaires: commentairesDemo,
    evenements: evenementsDemo,
    appels: appelsDemo,
    notifications: notificationsDemo,
    messagesClients: messagesClientsDemo,
  });
}

export const DEMO_GARAGE_ID = GARAGE_ID;
export const DEMO_MEMBRE_ID = 'm-simon';
