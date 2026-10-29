/**
 * Un seul chemin pour tout geste de statut et de blocage (v2c), partagé
 * par la carte du planning, la feuille d’actions, la barre et le menu de
 * la fiche. Les écrans ne parlent qu’à `executer` (une action venue de
 * `actionsPossibles` ou de `gesteCarte`) et aux quelques gestes nommés
 * ci-dessous ; ils rendent `FeuillesPassage` une fois.
 *
 * - Une écriture par geste : ses conséquences (journal, note client,
 *   masquage des étapes devenues fausses, notifications d’équipe) sont
 *   produites par la base, ou par le dépôt de démonstration à l’identique.
 *   Aucun écran ne publie plus de note client.
 * - Garde : après chaque changement de statut, pose ou levée (réussis ou
 *   non), `armerGarde` rend inertes les boutons de geste et la liste du
 *   planning, 1 000 ms (1 200 ms après « Prêt »).
 * - Avis : chaque changement se termine par un avis qui nomme la voiture
 *   et sa plaque, avec « Annuler » quand le geste se défait ; « Annuler »
 *   défait vraiment (`annulerDernierChangement`) au lieu d’empiler.
 * - Une attente d’accord ne se lève que par la feuille Accord (D3), par
 *   quelque bouton que ce soit, jamais en un appui.
 * - Le passage en « Véhicule prêt » suit l’offre du garage : feuille de
 *   confirmation du SMS, envoi automatique (préférence du gérant), ou, sans
 *   la prestation « Relances SMS », feuille qui propose l’app SMS du
 *   téléphone.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';

import { FeuilleConfirmation, GARDE_MS, GARDE_PRET_MS, armerGarde, gardeActive, impulsion, prendreGarde } from '@/components/ui';
import { repo } from '@/data';
import type { ResultatAnnulation } from '@/data/repo';
import { smsPretParti } from '@/domain/echeances';
import { aPrestation } from '@/domain/prestations';
import { REFUS } from '@/domain/journal';
import { peutAnnulerIntervention, peutAnnulerLivraison, peutLivrer } from '@/domain/permissions';
import { BLOCAGES, STATUTS, comparerEvenements, contexteActions, estBloquee, estRetourArriere, type Action } from '@/domain/statuts';
import type { Blocage, CanalAccord, CanalPrevenu, Client, DetailBlocage, Evenement, Intervention, MotifAnnulation, Statut, Vehicule } from '@/domain/types';
import { appelClient, dePrenom, gabaritSms, jourCourt, jourHeure, memeJour, nomClient, titreVoiture, voitureEtPlaque } from '@/lib/format';
import { useDonnees, useMembre, usePermissions, useSession } from '@/state/session';

import { useAvis, type ActionAvis } from './Avis';
import { FeuilleAccord } from './FeuilleAccord';
import { FeuilleBlocage, type EtapeBlocage } from './FeuilleBlocage';
import { FeuilleDeplacer } from './FeuilleDeplacer';
import { FeuilleSmsPret, peutRecevoirSms, type CibleSms, type FinSms } from './FeuilleSmsPret';

/** Le temps qu’une feuille se ferme avant d’en ouvrir une autre (iOS : une fenêtre modale à la fois). */
const FERMETURE_FEUILLE_MS = 260;

const pause = (ms: number) => new Promise<void>((fin) => setTimeout(fin, ms));

/** Avis de la pose d’un blocage (sans bouton : la feuille « Préciser » porte « Annuler le signalement »). */
const AVIS_POSE: Record<Blocage, string> = {
  attente_piece: 'Attente pièce signalée',
  attente_accord: 'Attente d’accord signalée',
  rappeler_client: 'Rappel du client signalé',
  client_sur_place: 'Blocage signalé',
};

/** « Déjà modifié par un collègue. » → « Déjà modifié par un collègue » : les avis ne finissent pas par un point. */
const sansPoint = (s: string) => s.trim().replace(/\.$/, '');

type Options = { motif?: MotifAnnulation; debut?: string; dureeMin?: number };

type CibleFeuille = { intervention: Intervention; client?: Client; vehicule?: Vehicule };

export function usePassageStatut() {
  const membre = useMembre();
  const p = usePermissions();
  const garage = useDonnees((s) => s.garage);
  const clients = useDonnees((s) => s.clients);
  const vehicules = useDonnees((s) => s.vehicules);
  const interventions = useDonnees((s) => s.interventions);
  const evenements = useDonnees((s) => s.evenements);

  const [cibleSms, setCibleSms] = useState<CibleSms | null>(null);
  const [blocage, setBlocage] = useState<{ id: string; etape: EtapeBlocage } | null>(null);
  const [accordPour, setAccordPour] = useState<string | null>(null);
  const [reprogrammerPour, setReprogrammerPour] = useState<string | null>(null);
  const [pretBloque, setPretBloque] = useState<string | null>(null);
  const [avis, montrerAvis] = useAvis();
  /** Un geste à la fois (deux appuis plus rapides qu’un rendu). */
  const occupe = useRef(false);
  /** Pose faite depuis la feuille Bloquer, par fiche : l’événement que « Annuler le signalement » défait. */
  const poses = useRef(new Map<string, string | undefined>());
  /**
   * « Véhicule prêt » demandé sur une attente d’accord : la feuille Accord
   * s’ouvre d’abord ; l’accord enregistré, la voiture passe en Prêt sans
   * second appui (l’intention n’est pas perdue). Oubliée si la feuille se
   * ferme sans accord.
   */
  const pretApresAccord = useRef<string | null>(null);

  const vehiculeDe = (i: Intervention) => vehicules.find((v) => v.id === i.vehiculeId);
  const clientDe = (i: Intervention) => clients.find((c) => c.id === i.clientId);
  /** L’intervention telle qu’elle est maintenant dans le store (après une écriture, un collègue). */
  const actuelle = (id: string) => useSession.getState().donnees?.interventions.find((x) => x.id === id);
  const cibleDe = (id: string | null): CibleFeuille | null => {
    const i = id ? interventions.find((x) => x.id === id) : undefined;
    // Copie superficielle : le dépôt de démonstration modifie les objets en place.
    return i ? { intervention: { ...i }, client: clientDe(i), vehicule: vehiculeDe(i) } : null;
  };

  /** « Véhicule reçu · Volkswagen Polo AA-004-AA · … » */
  const avec = (etat: string, i: Intervention, complement?: string) => [etat, voitureEtPlaque(vehiculeDe(i)), complement].filter(Boolean).join(' · ');

  /** Avis d’un changement de statut `de → vers` (§ 3.5.4 de la spécification). */
  function texteStatut(i: Intervention, de: Statut, vers: Statut, o?: Options): string {
    if (de === 'recu' && vers === 'planifie') return avec('Pas encore arrivé', i);
    if (de === 'livre' && vers === 'termine') return avec('Livraison annulée', i);
    if (de === 'annule' && vers === 'planifie') return avec(`Reprogrammé au ${jourHeure(o?.debut ?? i.debut)}`, i);
    if (vers === 'planifie') return avec(STATUTS.planifie.label, i, jourHeure(o?.debut ?? i.debut));
    if (vers === 'annule') return avec('Intervention annulée', i);
    if (estRetourArriere(de, vers)) {
      // Le client a déjà reçu le SMS « prêt » : l’avis le dit aussi à celui qui revient en arrière (sa page l’annonce).
      const smsParti = de === 'termine' && smsPretParti(i, evenements.filter((e) => e.interventionId === i.id));
      return avec(`Revenu à « ${STATUTS[vers].label} »`, i, smsParti ? 'le SMS était déjà parti' : undefined);
    }
    return avec(STATUTS[vers].label, i);
  }

  /**
   * « Véhicule prêt · Renault Mégane III AA-006-AA · SMS envoyé à Hugo » (ou
   * « Hugo n’a pas reçu de SMS », ou « message pour Hugo ouvert dans vos
   * SMS » sans la prestation « Relances SMS »)
   */
  function textePret(i: Intervention, fin: FinSms): string {
    // Prénom facultatif : le nom, sinon « le client ».
    const prenom = appelClient(clientDe(i), '');
    const complement =
      fin === 'sms'
        ? prenom
          ? `SMS envoyé à ${prenom}`
          : 'SMS envoyé'
        : fin === 'telephone'
          ? `message pour ${prenom || 'le client'} ouvert dans vos SMS`
          : prenom
            ? `${prenom} n’a pas reçu de SMS`
            : 'le client n’a pas reçu de SMS';
    return avec(STATUTS.termine.label, i, complement);
  }

  /** « Annulé · revenu à « En cours » », « Revenu à « En cours » · le SMS était déjà parti » */
  function texteAnnule(r: ResultatAnnulation): string {
    const etat = r.blocage && (r.statut === 'planifie' || r.statut === 'recu' || r.statut === 'en_cours') ? BLOCAGES[r.blocage].label : STATUTS[r.statut].label;
    return r.smsParti ? `Revenu à « ${etat} » · le SMS était déjà parti` : `Annulé · revenu à « ${etat} »`;
  }

  /**
   * Une écriture protégée : un geste à la fois, garde tenue pendant
   * l’écriture puis armée à sa fin, succès ou échec (l’erreur remonte).
   */
  async function proteger<T>(ecrire: () => Promise<T>, gardeMs: number): Promise<T> {
    occupe.current = true;
    const rendre = prendreGarde();
    try {
      return await ecrire();
    } finally {
      armerGarde(gardeMs);
      rendre();
      occupe.current = false;
    }
  }

  /**
   * Un geste réussi sur la voiture vaut lecture, comme l’ouverture de sa
   * fiche : les notifications non lues adressées au membre pour cette
   * intervention (« Nouvelle voiture pour vous »…) passent en lues, et la
   * pastille « Nouvelle » de la carte et la cloche retombent. Un confort :
   * un échec ne change rien au geste.
   */
  function marquerVues(id: string) {
    const notifications = useSession.getState().donnees?.notifications ?? [];
    for (const n of notifications) {
      if (n.lue || n.membreId !== membre.id || n.cible?.type !== 'intervention' || n.cible.id !== id) continue;
      repo()
        .marquerLue(n.id)
        .catch(() => {});
    }
  }

  /** Refus d’écran, avant tout appel, identiques à R1 à R3 du serveur (le bouton est absent ; garde-fou si un écran l’oubliait). */
  function refusEcran(i: Intervention, vers: Statut): string | null {
    if (vers === 'livre' && !peutLivrer(membre)) return REFUS.R1;
    if (vers === 'annule' && !peutAnnulerIntervention(membre, i.statut)) return REFUS.R2;
    if (i.statut === 'livre' && !peutAnnulerLivraison(membre, contexteActions(membre, p, evenements, { interventionId: i.id }).livreLe)) {
      return REFUS.R3;
    }
    return null;
  }

  /**
   * Dernier changement de statut ou de blocage signé par ce membre sur la
   * fiche, lu dans l’instantané rechargé juste après le geste (même ordre
   * que le serveur : date, puis rang). C’est lui que nomme l’avis, et lui
   * seul que « Annuler » défera : un geste fait entre-temps, sur un autre
   * écran, n’est jamais défait à sa place (J14).
   */
  function dernierChangement(id: string): string | undefined {
    let dernier: Evenement | undefined;
    for (const e of useSession.getState().donnees?.evenements ?? []) {
      if (e.interventionId !== id || e.membreId !== membre.id || (e.type !== 'statut' && e.type !== 'blocage')) continue;
      if (!dernier || comparerEvenements(dernier, e) <= 0) dernier = e;
    }
    return dernier?.id;
  }

  /** « Annuler » de l’avis : défait le changement que l’avis nomme, sans nouvel événement. */
  async function annulerDernier(i: Intervention, evenementId?: string): Promise<void> {
    try {
      const r = await proteger(() => repo().annulerDernierChangement(i.id, membre.id, evenementId), GARDE_MS);
      impulsion('leger');
      montrerAvis(texteAnnule(r));
    } catch (e) {
      impulsion('erreur');
      montrerAvis(sansPoint((e as Error).message || 'Impossible d’annuler le changement'));
    }
  }

  /** Bouton « Annuler » d’un avis, lié au changement que le geste vient d’écrire. */
  const boutonAnnuler = (i: Intervention): ActionAvis => {
    const evenementId = dernierChangement(i.id);
    return { libelle: 'Annuler', onPress: () => void annulerDernier(i, evenementId) };
  };

  /** Changement de statut écrit (sans feuille) : garde, avis, « Annuler » sauf pour une reprogrammation. */
  async function changer(i: Intervention, vers: Statut, o?: Options): Promise<void> {
    const de = i.statut;
    await proteger(() => repo().changerStatut(i.id, vers, membre.id, o), vers === 'termine' ? GARDE_PRET_MS : GARDE_MS);
    impulsion('succes');
    marquerVues(i.id);
    const texte = texteStatut(i, de, vers, o);
    // La reprogrammation ne se défait pas d’un appui : l’avis la nomme, sans bouton.
    if (de === 'annule' && vers === 'planifie') montrerAvis(texte);
    else montrerAvis(texte, boutonAnnuler(i));
  }

  /**
   * Passage en « Véhicule prêt » : feuille SMS, envoi automatique, ou simple
   * changement (D6 : sans mobile, pas de SMS). Sans la prestation « Relances
   * SMS », la feuille propose l’app SMS du téléphone (lien de suivi compris)
   * dès que le client a un mobile.
   */
  async function versPret(i: Intervention): Promise<void> {
    const client = clientDe(i);
    const relancesSms = aPrestation(garage, 'sms');
    if (relancesSms ? !garage.options.smsAutomatique : peutRecevoirSms(client)) {
      setCibleSms({ intervention: i, client, vehicule: vehiculeDe(i) });
      return;
    }
    const envoyer = relancesSms && peutRecevoirSms(client);
    let smsParti = false;
    await proteger(async () => {
      await repo().changerStatut(i.id, 'termine', membre.id);
      if (!envoyer) return;
      try {
        await repo().envoyerSmsPret(i.id, membre.id, gabaritSms(garage.texteSmsPret, { prenom: client?.prenom ?? '', garage: garage.nom }));
        smsParti = true;
      } catch {
        // Le statut a changé : l’avis dit que le client n’a pas reçu de SMS.
      }
    }, GARDE_PRET_MS);
    impulsion(envoyer && !smsParti ? 'erreur' : 'succes');
    marquerVues(i.id);
    montrerAvis(textePret(i, smsParti ? 'sms' : 'sans'), boutonAnnuler(i));
  }

  /** Changement de statut demandé par un écran (« Confirmer », annulation, reprogrammation, retour). */
  async function passer(i: Intervention, vers: Statut, o?: Options): Promise<void> {
    if (occupe.current || gardeActive()) return;
    const refus = refusEcran(i, vers);
    if (refus) throw new Error(refus);
    if (vers === 'termine' && i.statut !== 'livre') {
      await versPret(i);
      return;
    }
    await changer(i, vers, o);
  }

  /** Levée d’un blocage autre qu’une attente d’accord : un appui, « Annuler » dans l’avis. */
  async function lever(i: Intervention): Promise<void> {
    const b = i.blocage;
    if (!b) return;
    if (b === 'attente_accord') {
      ouvrirAccord(i);
      return;
    }
    await proteger(() => repo().changerBlocage(i.id, null, membre.id), GARDE_MS);
    impulsion('succes');
    marquerVues(i.id);
    montrerAvis(avec(b === 'client_sur_place' ? 'Débloqué' : BLOCAGES[b].levee, i), boutonAnnuler(i));
  }

  /** Pose d’un blocage (sans détail) ; l’étape « Préciser » suit. */
  async function poser(i: Intervention, b: Blocage): Promise<void> {
    await proteger(() => repo().changerBlocage(i.id, b, membre.id), GARDE_MS);
    poses.current.set(i.id, dernierChangement(i.id));
    impulsion('succes');
    marquerVues(i.id);
    montrerAvis(avec(AVIS_POSE[b], i));
  }

  function ouvrirBlocage(i: Intervention, o?: { etape?: EtapeBlocage }) {
    setBlocage({ id: i.id, etape: o?.etape ?? 'type' });
  }

  function ouvrirAccord(i: Intervention) {
    setAccordPour(i.id);
  }

  function ouvrirReprogrammation(i: Intervention) {
    setReprogrammerPour(i.id);
  }

  /** Toute action de `actionsPossibles` ou `gesteCarte`, quel que soit l’écran. */
  async function executer(i: Intervention, a: Action): Promise<void> {
    // Garde-fou : les boutons sont déjà inertes pendant la garde.
    if (occupe.current || gardeActive()) return;
    if (a.type === 'blocage') {
      if (a.vers === null) {
        await lever(i);
        return;
      }
      await poser(i, a.vers);
      // La feuille d’où vient le geste (actions, Bloquer) finit de se fermer avant « Préciser ».
      await pause(FERMETURE_FEUILLE_MS);
      ouvrirBlocage(i, { etape: 'preciser' });
      return;
    }
    const refus = refusEcran(i, a.vers);
    if (refus) throw new Error(refus);
    if (a.vers === 'termine' && i.statut !== 'livre' && estBloquee(i)) {
      setPretBloque(i.id);
      return;
    }
    // Plus de « Réactiver » à la date passée : on choisit un créneau à venir.
    if (i.statut === 'annule' && a.vers === 'planifie') {
      ouvrirReprogrammation(i);
      return;
    }
    if (a.vers === 'termine' && i.statut !== 'livre') {
      await versPret(i);
      return;
    }
    // « Annuler l’intervention » passe d’ordinaire par la feuille d’annulation (motif, E2) ; ici, sans motif.
    await changer(i, a.vers);
  }

  /** Client prévenu d’une voiture prête (appel, répondeur ou SMS écrit) : une trace, sans bouton « Annuler ». */
  async function marquerPrevenu(i: Intervention, canal: CanalPrevenu): Promise<void> {
    await repo().marquerPrevenu(i.id, canal, membre.id);
    impulsion('succes');
    montrerAvis(avec(canal === 'appel' ? 'Prévenu par téléphone' : canal === 'sms' ? 'Prévenu par SMS' : 'Répondeur noté', i));
  }

  /** Devis transmis pendant une attente d’accord (P2). */
  async function marquerDevisEnvoye(i: Intervention): Promise<void> {
    await repo().marquerDevisEnvoye(i.id, membre.id);
    impulsion('succes');
    montrerAvis(avec('Devis envoyé', i));
  }

  // ── Feuilles : gestes faits depuis une feuille ouverte par ce crochet

  async function poserDepuisFeuille(b: Blocage): Promise<void> {
    const i = blocage ? actuelle(blocage.id) : undefined;
    if (!i) return;
    await poser(i, b);
    setBlocage({ id: i.id, etape: 'preciser' });
  }

  async function preciser(d: DetailBlocage, o: { devisEnvoye?: boolean }): Promise<void> {
    const i = blocage ? actuelle(blocage.id) : undefined;
    if (!i?.blocage) return;
    const pourAvant = i.detailBlocage?.pour;
    try {
      await repo().changerBlocage(i.id, i.blocage, membre.id, d);
      if (o.devisEnvoye && i.blocage === 'attente_accord' && !i.devisEnvoyeLe) await repo().marquerDevisEnvoye(i.id, membre.id);
    } finally {
      // La feuille se ferme sur la liste : le second appui d’un double appui n’y tombe pas.
      armerGarde(GARDE_MS);
    }
    impulsion('succes');
    setBlocage(null);
    const reportee = i.blocage === 'attente_piece' && d.annonce && d.pour && pourAvant && !memeJour(new Date(pourAvant), new Date(d.pour));
    // Même mot que le fil (texteEvenement) : « avancée » quand la nouvelle date est plus tôt (R1).
    const sens = reportee && d.pour && pourAvant && new Date(d.pour).getTime() < new Date(pourAvant).getTime() ? 'avancée' : 'repoussée';
    montrerAvis(reportee && d.pour ? avec(`Pièce ${sens} au ${jourCourt(d.pour)}`, i) : avec('Attente précisée', i));
  }

  async function annulerPose(): Promise<void> {
    const i = blocage ? actuelle(blocage.id) : undefined;
    if (!i) return;
    await proteger(() => repo().annulerDernierChangement(i.id, membre.id, poses.current.get(i.id)), GARDE_MS);
    poses.current.delete(i.id);
    impulsion('leger');
    setBlocage(null);
    montrerAvis(avec('Signalement annulé', i));
  }

  function leverDepuisFeuille() {
    const i = blocage ? actuelle(blocage.id) : undefined;
    setBlocage(null);
    if (!i?.blocage) return;
    setTimeout(() => {
      lever(i).catch((e: Error) => montrerAvis(e.message || 'Impossible de lever l’attente.'));
    }, FERMETURE_FEUILLE_MS);
  }

  async function enregistrerAccord(a: { de: string; canal: CanalAccord; montant?: number }): Promise<void> {
    const i = accordPour ? actuelle(accordPour) : undefined;
    if (!i) return;
    await proteger(() => repo().noterAccord(i.id, a, membre.id), GARDE_MS);
    impulsion('succes');
    marquerVues(i.id);
    setAccordPour(null);
    // L’accord ne se défait pas d’un appui : sa trace fait preuve.
    montrerAvis(avec('Accord noté', i));
    if (pretApresAccord.current !== i.id) return;
    pretApresAccord.current = null;
    // « Véhicule prêt » avait été demandé : la feuille Accord se ferme, puis le passage en Prêt (feuille SMS, envoi automatique ou simple changement).
    await pause(FERMETURE_FEUILLE_MS);
    const apres = actuelle(i.id);
    if (!apres || apres.statut === 'termine' || apres.statut === 'livre' || estBloquee(apres)) return;
    try {
      await versPret(apres);
    } catch (e) {
      impulsion('erreur');
      montrerAvis((e as Error).message || 'Impossible de passer en véhicule prêt.');
    }
  }

  async function reprogrammer(o: { debut: string; dureeMin: number }): Promise<void> {
    const i = reprogrammerPour ? actuelle(reprogrammerPour) : undefined;
    if (!i) return;
    try {
      await changer(i, 'planifie', o);
    } catch (e) {
      impulsion('erreur');
      montrerAvis((e as Error).message || 'Impossible de reprogrammer le rendez-vous.');
    }
  }

  /** Confirmation « Prêt » sur une fiche bloquée : « Noter l’accord », ou « Lever et passer en Prêt ». */
  async function confirmerPret(): Promise<void> {
    const id = pretBloque;
    setPretBloque(null);
    if (!id) return;
    await pause(FERMETURE_FEUILLE_MS);
    const i = actuelle(id);
    if (!i) return;
    if (i.blocage === 'attente_accord') {
      pretApresAccord.current = i.id;
      ouvrirAccord(i);
      return;
    }
    try {
      // Une écriture : le passage en Prêt lève le blocage (rétabli par « Annuler »).
      await versPret(i);
    } catch (e) {
      impulsion('erreur');
      montrerAvis((e as Error).message || 'Impossible de passer en véhicule prêt.');
    }
  }

  /** Fin de la feuille SMS : le statut a changé, avec ou sans SMS (garde armée par la feuille). */
  function finSms(fin: FinSms, cible: CibleSms) {
    marquerVues(cible.intervention.id);
    montrerAvis(textePret(cible.intervention, fin), boutonAnnuler(cible.intervention));
  }

  return {
    executer,
    passer,
    ouvrirBlocage,
    ouvrirAccord,
    ouvrirReprogrammation,
    marquerPrevenu,
    marquerDevisEnvoye,
    annulerDernier,
    avis,
    montrerAvis,
    /** États lus par `FeuillesPassage` */
    interne: {
      cibleSms,
      fermerSms: () => setCibleSms(null),
      finSms,
      blocage: blocage ? { cible: cibleDe(blocage.id), etape: blocage.etape } : null,
      fermerBlocage: () => setBlocage(null),
      poserDepuisFeuille,
      preciser,
      annulerPose,
      leverDepuisFeuille,
      accord: cibleDe(accordPour),
      fermerAccord: () => {
        pretApresAccord.current = null;
        setAccordPour(null);
      },
      enregistrerAccord,
      reprogrammation: cibleDe(reprogrammerPour),
      fermerReprogrammation: () => setReprogrammerPour(null),
      reprogrammer,
      pretBloque: cibleDe(pretBloque),
      fermerPretBloque: () => setPretBloque(null),
      confirmerPret,
    },
  };
}

export type PassageStatut = ReturnType<typeof usePassageStatut>;

/**
 * Les feuilles du passage de statut, à rendre une fois dans l’écran : SMS
 * « prêt », Bloquer, Accord, Reprogrammer, et les deux confirmations de
 * « Prêt » sur une fiche bloquée (inertes `GARDE_MS`, ouvertes par un
 * geste). `onFait` prévient l’écran qu’un geste vient d’aboutir dans une
 * feuille.
 */
export function FeuillesPassage({ passage, onFait }: { passage: PassageStatut; onFait?: () => void }): ReactElement {
  const garage = useDonnees((s) => s.garage);
  const x = passage.interne;
  const { montrerAvis } = passage;

  // La feuille Reprogrammer garde sa dernière cible le temps de se fermer.
  const derniereReprog = useRef<CibleFeuille | null>(null);
  useEffect(() => {
    if (x.reprogrammation) derniereReprog.current = x.reprogrammation;
  }, [x.reprogrammation]);
  const reprog = x.reprogrammation ?? derniereReprog.current;

  const bloquee = x.pretBloque;
  const accord = bloquee?.intervention.blocage === 'attente_accord';
  const nomDuClient = bloquee?.client ? nomClient(bloquee.client, '') || null : null;
  const titrePret = !bloquee?.intervention.blocage
    ? ''
    : accord
      ? nomDuClient
        ? `L’accord ${dePrenom(nomDuClient)} n’est pas noté`
        : 'L’accord du client n’est pas noté'
      : BLOCAGES[bloquee.intervention.blocage].nonLeve;
  // Envoi automatique : le SMS « prêt » part avec le passage en Prêt ; la confirmation le dit avant le geste.
  const smsAuto = aPrestation(garage, 'sms') && garage.options.smsAutomatique && peutRecevoirSms(bloquee?.client);
  const prenomSms = appelClient(bloquee?.client, '');
  const phraseSms = smsAuto ? ` Le SMS « prêt » partira aussitôt${prenomSms ? ` chez ${prenomSms}` : ''}.` : '';
  const textePret = accord
    ? `Notez d’abord ${nomDuClient ? 'son accord' : 'l’accord'}. La voiture passera ensuite en « ${STATUTS.termine.label} ».${phraseSms}`
    : `Passer quand même en « ${STATUTS.termine.label} » ? L’attente sera levée et le client lira « ${STATUTS.termine.client} »${phraseSms}`;

  return (
    <>
      <FeuilleSmsPret
        cible={x.cibleSms}
        onFermer={x.fermerSms}
        onFait={(fin, cible) => {
          x.finSms(fin, cible);
          onFait?.();
        }}
        onErreur={montrerAvis}
      />
      <FeuilleBlocage
        cible={x.blocage?.cible ? { ...x.blocage.cible, etape: x.blocage.etape } : null}
        horaires={garage.horaires}
        onFermer={x.fermerBlocage}
        onPoser={x.poserDepuisFeuille}
        onPreciser={async (d, o) => {
          await x.preciser(d, o);
          onFait?.();
        }}
        onAnnulerPose={async () => {
          await x.annulerPose();
          onFait?.();
        }}
        onLever={x.leverDepuisFeuille}
      />
      <FeuilleAccord
        cible={x.accord}
        onFermer={x.fermerAccord}
        onEnregistrer={async (a) => {
          await x.enregistrerAccord(a);
          onFait?.();
        }}
      />
      {reprog ? (
        <FeuilleDeplacer
          mode="reprogrammer"
          ouverte={x.reprogrammation !== null}
          onFermer={x.fermerReprogrammation}
          intervention={reprog.intervention}
          client={reprog.client}
          vehicule={reprog.vehicule}
          horaires={garage.horaires}
          onAvis={montrerAvis}
          onReprogrammer={async (o) => {
            await x.reprogrammer(o);
            onFait?.();
          }}
        />
      ) : null}
      <FeuilleConfirmation
        ouverte={bloquee !== null}
        onFermer={x.fermerPretBloque}
        titre={titrePret}
        legende={bloquee ? [titreVoiture(bloquee.vehicule), nomDuClient].filter(Boolean).join(' · ') : undefined}
        texte={bloquee ? textePret : undefined}
        libelle={accord ? 'Noter l’accord' : 'Lever et passer en Prêt'}
        libelleRetour={accord ? 'Plus tard' : 'Non'}
        variante="principal"
        inerteMs={GARDE_MS}
        onConfirmer={async () => {
          await x.confirmerPret();
          onFait?.();
        }}
      />
    </>
  );
}
