/**
 * Nouvelle intervention (comptoir) : trois étapes dans un seul écran
 * modal. Client existant ou nouveau, véhicule connu ou autre, puis la
 * prestation, le créneau, la durée, le mécanicien. Arrive directement en
 * « Rendez-vous confirmé » dans le planning.
 *
 * Paramètres : `clientId` (depuis la fiche client), `appelId` (depuis la
 * fiche d'un appel : tout ce que l'appelant a donné préremplit les trois
 * étapes, voir components/nouvelle-intervention/depart.ts, et l'appel est
 * relié à la fiche créée), ou `telephone` seul (client retrouvé par son
 * numéro, sinon formulaire prérempli).
 *
 * Ouvert depuis le planning (sans paramètre), « Ajouter au planning »
 * referme l'assistant : le planning montre l'avis « Ajouté · Ouvrir » et
 * le comptoir enchaîne le dépôt suivant sans « Retour ».
 *
 * v2c (E5) : « Déjà au garage » en tête de « Quand ? » (arrivée à l'heure
 * réelle, kilométrage relevé, « Ajouter et réceptionner » : le dépôt crée
 * puis réceptionne) ; retour prévu au dépôt ; mobile facultatif ; doublons
 * signalés sans bloquer, en bandeau au-dessus du bouton : mobile déjà
 * connu, plaque déjà enregistrée, voiture qui a déjà une intervention
 * ouverte.
 */

import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarClient } from '@/components/clients/AvatarClient';
import { natureTelephone, validerClient, versClient, type ErreursClient, type ValeursClient } from '@/components/clients/FormulaireClient';
import { validerVehicule, versVehicule, type ErreursVehicule, type ValeursVehicule } from '@/components/clients/FormulaireVehicule';
import { clientsVisibles, fichesClients, fusionnerSansVide, interventionsVisibles, libelleVehicule } from '@/components/clients/outils';
import { DUREE_PAR_DEFAUT, joursProchains, premierCreneauLibre, premierJourDisponible } from '@/components/nouvelle-intervention/creneaux';
import {
  clientDuMobile,
  interventionOuverte,
  phraseInterventionOuverte,
  phraseMobileConnu,
  phrasePlaqueConnue,
  vehiculeDeLaPlaque,
} from '@/components/nouvelle-intervention/doublons';
import { etatDeDepart, type ChoixClient, type ChoixVehicule } from '@/components/nouvelle-intervention/depart';
import { EtapeClient } from '@/components/nouvelle-intervention/EtapeClient';
import {
  EtapeIntervention,
  ORDRE_BLOCS,
  debutDe,
  retourValable,
  type BlocIntervention,
  type ErreursIntervention,
  type ValeursIntervention,
} from '@/components/nouvelle-intervention/EtapeIntervention';
import { Etapes, type Etape } from '@/components/nouvelle-intervention/Etapes';
import { EtapeVehicule } from '@/components/nouvelle-intervention/EtapeVehicule';
import { signalerAjout } from '@/components/planning/ajout';
import { Bouton, BoutonRond, Ecran, Erreur, FeuilleConfirmation, Groupe, Icone, LARGEUR_MAX, Ligne, Mono, Secondaire, SousTitre, Texte, Vide, impulsion } from '@/components/ui';
import { repo, type NouvelleIntervention as Nouvelle } from '@/data';
import { ReceptionEchouee } from '@/data/erreurs';
import { dernierReleve } from '@/domain/echeances';
import { KM_MAX } from '@/domain/statuts';
import type { Client, Intervention, Vehicule } from '@/domain/types';
import { chiffresKm, formaterPlaque, formaterTelephone, nomClient as nomDuClient } from '@/lib/format';
import { useDonnees, useMembre, usePermissions } from '@/state/session';
import { useTheme } from '@/theme/tokens';

/**
 * Kilométrage au dépôt saisi : un nombre, rien (champ vide, ou voiture pas
 * encore là : le relevé se fera à la réception), ou « invalide » (R14).
 */
function kmSaisi(v: Pick<ValeursIntervention, 'dejaAuGarage' | 'km'>): number | undefined | 'invalide' {
  if (!v.dejaAuGarage || !v.km.trim()) return undefined;
  if (/[^\d\s.]/.test(v.km)) return 'invalide';
  const n = chiffresKm(v.km);
  return n === undefined || n > KM_MAX ? 'invalide' : n;
}

type ActionPied = { libelle: string; onPress: () => void | Promise<void>; chargement?: boolean };

/**
 * Doublon signalé au-dessus du bouton (P4) : non bloquant, l'utilisateur
 * choisit entre la fiche existante et « Créer quand même ».
 */
function BandeauDoublon({ texte, action }: { texte: string; action: ActionPied | null }) {
  const t = useTheme();
  // VoiceOver n'a pas de région vivante : l'avertissement est annoncé à son apparition.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(texte);
  }, [texte]);
  return (
    <View accessibilityLiveRegion="polite" className="mb-3 flex-row items-start gap-2.5 rounded-xl bg-warn-soft px-3.5 pt-3 pb-1.5 dark:bg-warn-softdark">
      <View className="pt-0.5">
        <Icone nom="alerte" taille={18} couleur={t.warn} />
      </View>
      <View className="flex-1">
        <Texte accessibilityLabel={`Attention : ${texte}`} className={action ? '' : 'pb-1.5'}>
          {texte}
        </Texte>
        {action ? (
          <Bouton variante="discret" compact onPress={action.onPress} className="-ml-3 self-start">
            {action.libelle}
          </Bouton>
        ) : null}
      </View>
    </View>
  );
}

export default function NouvelleIntervention() {
  const params = useLocalSearchParams<{ clientId?: string; telephone?: string; appelId?: string }>();
  const telephoneParam = params.telephone?.trim() || undefined;
  const appelId = params.appelId || undefined;
  // Ouvert depuis le planning : on y revient après l'ajout.
  const depuisPlanning = !params.clientId && !appelId;
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const membre = useMembre();
  const p = usePermissions();
  const garage = useDonnees((s) => s.garage);
  const membres = useDonnees((s) => s.membres);
  const clients = useDonnees((s) => s.clients);
  const vehicules = useDonnees((s) => s.vehicules);
  const interventions = useDonnees((s) => s.interventions);
  const appels = useDonnees((s) => s.appels);
  // Fiche déjà reliée à l'appel entre-temps (fiche à valider, collègue) : elle n'est pas remplacée.
  const appelDejaLie = useDonnees((s) => Boolean(appelId && s.appels.find((a) => a.id === appelId)?.interventionId));

  const defilement = useRef<KeyboardAwareScrollViewRef>(null);

  // Point de départ selon l'origine (planning, fiche client, fiche d'un appel), calculé une fois.
  const [depart] = useState(() =>
    etatDeDepart({
      clientId: params.clientId,
      telephone: telephoneParam,
      appel: appelId ? appels.find((a) => a.id === appelId) : undefined,
      clients,
      visibles: clientsVisibles(clients, interventions, membre, p),
      vehicules,
    }),
  );

  // ── État du parcours
  const [choixClient, setChoixClient] = useState<ChoixClient | null>(depart.choixClient);
  const [choixVehicule, setChoixVehicule] = useState<ChoixVehicule | null>(depart.choixVehicule);
  const [etape, setEtape] = useState<Etape>(depart.etape);

  const [requete, setRequete] = useState(depart.requete);
  const [nouveauClient, setNouveauClient] = useState(depart.nouveauClient);
  const [valeursClient, setValeursClient] = useState<ValeursClient>(depart.valeursClient);
  const [erreursClient, setErreursClient] = useState<ErreursClient>({});

  const [autreVehicule, setAutreVehicule] = useState(depart.autreVehicule);
  const [valeursVehicule, setValeursVehicule] = useState<ValeursVehicule>(depart.valeursVehicule);
  const [erreursVehicule, setErreursVehicule] = useState<ErreursVehicule>({});

  const [valeurs, setValeurs] = useState<ValeursIntervention>(() => {
    const jours = joursProchains(garage.horaires);
    const jour = premierJourDisponible(jours, garage.horaires) ?? jours[0];
    return {
      prestation: depart.prestation,
      demande: depart.demande,
      jour: jour.cle,
      creneau: premierCreneauLibre(jour.date, garage.horaires)?.iso ?? null,
      dureeMin: DUREE_PAR_DEFAUT,
      // Sans « voir tout », une fiche sans mécanicien disparaîtrait de son planning : elle lui revient d'office.
      membreId: p.voirTout ? null : membre.id,
      prioritaire: false,
      memo: '',
      montant: '',
      dejaAuGarage: false,
      retour: null,
      km: '',
      kmRepris: '',
    };
  });
  // Doublons signalés puis écartés par « Créer quand même » : « mobile:<client> », « plaque:<véhicule> », « ouverte:<intervention> ».
  const [ecartes, setEcartes] = useState<string[]>([]);
  const ecarter = (cle: string) => setEcartes((e) => (e.includes(cle) ? e : [...e, cle]));
  const [erreurs, setErreurs] = useState<ErreursIntervention>({});
  const [enCours, setEnCours] = useState(false);
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);

  // Ce que le membre voit (mêmes règles que la recherche) : la base des fiches et des doublons.
  const clientsVus = useMemo(() => clientsVisibles(clients, interventions, membre, p), [clients, interventions, membre, p]);
  const interventionsVues = useMemo(() => interventionsVisibles(interventions, membre, p), [interventions, membre, p]);
  const vehiculesVus = useMemo(() => {
    const ids = new Set(clientsVus.map((c) => c.id));
    return vehicules.filter((v) => ids.has(v.clientId));
  }, [clientsVus, vehicules]);
  const fiches = useMemo(() => fichesClients(clientsVus, vehicules, interventionsVues), [clientsVus, vehicules, interventionsVues]);
  // Le réceptionnaire ne prend pas de voiture (sauf s'il est déjà choisi : fiche qui lui revient d'office).
  const equipe = useMemo(
    () => membres.filter((m) => m.actif && !m.invitationEnAttente && (m.poste !== 'receptionnaire' || m.id === valeurs.membreId)),
    [membres, valeurs.membreId],
  );
  const vehiculesClient = useMemo(
    () => (choixClient?.mode === 'existant' ? vehicules.filter((v) => v.clientId === choixClient.client.id) : []),
    [vehicules, choixClient],
  );

  // ── Fermeture (croix, glissement de la modale) : rien ne se perd sans prévenir.
  // Empreinte de ce qui serait perdu, comparée à l'état d'ouverture (client
  // présélectionné depuis une fiche, numéro venu d'un appel).
  const empreinte = JSON.stringify([
    choixClient?.mode === 'existant' ? choixClient.client.id : (choixClient?.mode ?? null),
    choixVehicule?.mode === 'existant' ? choixVehicule.vehicule.id : (choixVehicule?.mode ?? null),
    valeursClient,
    valeursVehicule,
    valeurs,
  ]);
  const [empreinteOuverture] = useState(empreinte);
  const saisieCommencee = empreinte !== empreinteOuverture;
  const enregistree = useRef(false);
  const [sortie, setSortie] = useState<NavigationAction | null>(null);
  usePreventRemove(saisieCommencee && !enCours, ({ data }) => {
    if (enregistree.current) {
      navigation.dispatch(data.action);
      return;
    }
    setSortie(data.action);
  });

  // Hauteur du pied collé au clavier : le champ actif reste visible juste au-dessus.
  const [hauteurPied, setHauteurPied] = useState(0);
  const ecartPied = hauteurPied > 0 ? hauteurPied - insets.bottom + 16 : 96;

  useEffect(() => {
    defilement.current?.scrollTo({ y: 0, animated: false });
  }, [etape]);

  // Positions des blocs de l'étape 3 dans le défilement : « Ajouter » amène au premier bloc en erreur.
  const origineEtape = useRef(0);
  const positions = useRef<Partial<Record<BlocIntervention, number>>>({});

  // Une erreur de l'étape 3 s'efface dès que le champ concerné est corrigé.
  useEffect(() => {
    setErreurs((e) => {
      if (!e.prestation && !e.creneau && !e.km && !e.montant) return e;
      const n = { ...e };
      if (e.prestation && valeurs.prestation.trim()) delete n.prestation;
      if (e.creneau && (valeurs.creneau || valeurs.dejaAuGarage)) delete n.creneau;
      if (e.km && kmSaisi(valeurs) !== 'invalide') delete n.km;
      if (e.montant && (!valeurs.montant.trim() || /\d/.test(valeurs.montant))) delete n.montant;
      return n;
    });
  }, [valeurs.prestation, valeurs.creneau, valeurs.dejaAuGarage, valeurs.km, valeurs.montant]);

  // ── Transitions

  function aller(e: Etape) {
    setErreurGlobale(null);
    setEtape(e);
  }

  /** Une ligne de recherche porte le client et, le plus souvent, un véhicule précis. */
  function choisirClient(c: Client, vehicule?: Vehicule) {
    impulsion('leger');
    setChoixClient({ mode: 'existant', client: c });
    const vs = vehicules.filter((v) => v.clientId === c.id);
    setAutreVehicule(false);
    const choisi = vehicule ?? (vs.length === 1 ? vs[0] : undefined);
    if (choisi) {
      setChoixVehicule({ mode: 'existant', vehicule: choisi });
      aller(3);
    } else {
      setChoixVehicule(null);
      aller(2);
    }
  }

  function continuerNouveauClient() {
    const e = validerClient(valeursClient);
    setErreursClient(e);
    if (Object.keys(e).length) {
      impulsion('erreur');
      return;
    }
    setChoixClient({ mode: 'nouveau' });
    setChoixVehicule(null);
    setAutreVehicule(true);
    aller(2);
  }

  function choisirVehicule(v: Vehicule) {
    impulsion('leger');
    setChoixVehicule({ mode: 'existant', vehicule: v });
    aller(3);
  }

  function continuerAutreVehicule() {
    const e = validerVehicule(valeursVehicule);
    setErreursVehicule(e);
    if (Object.keys(e).length) {
      impulsion('erreur');
      return;
    }
    setChoixVehicule({ mode: 'nouveau' });
    aller(3);
  }

  /** Doublon écarté : on rouvre une fiche existante, la saisie en cours est abandonnée sans question. */
  function ouvrirExistante(i: Intervention) {
    impulsion('leger');
    enregistree.current = true;
    router.replace(`/intervention/${i.id}`);
  }

  async function enregistrer() {
    if (!choixClient || !choixVehicule) return;
    const maintenant = new Date();
    // « Déjà au garage » : arrivée maintenant, même hors des horaires (clés déposées dans la boîte).
    const debut = debutDe(valeurs, maintenant);
    const km = kmSaisi(valeurs);
    const e: ErreursIntervention = {};
    if (!valeurs.prestation.trim()) e.prestation = 'Indiquez la prestation.';
    if (!debut) e.creneau = 'Choisissez un créneau.';
    if (km === 'invalide') e.km = 'Kilométrage invalide.';
    const montantChiffres = valeurs.montant.replace(/[^\d]/g, '');
    if (valeurs.montant.trim() && !montantChiffres) e.montant = 'Montant en chiffres.';
    setErreurs(e);
    if (Object.keys(e).length || !debut || km === 'invalide') {
      impulsion('erreur');
      const bloc = ORDRE_BLOCS.find((b) => e[b]) ?? 'creneau';
      const y = positions.current[bloc];
      defilement.current?.scrollTo({ y: y === undefined ? 0 : Math.max(0, origineEtape.current + y - 12), animated: true });
      return;
    }
    const n: Nouvelle = {
      client: choixClient.mode === 'existant' ? { id: choixClient.client.id } : versClient(valeursClient),
      vehicule: choixVehicule.mode === 'existant' ? { id: choixVehicule.vehicule.id } : versVehicule(valeursVehicule),
      prestation: valeurs.prestation.trim(),
      demande: valeurs.demande.trim() || undefined,
      debut,
      dureeMin: valeurs.dureeMin,
      membreId: valeurs.membreId,
      origine: appelId ? 'telephone' : 'comptoir',
      prioritaire: valeurs.prioritaire,
      memo: valeurs.memo.trim() || undefined,
      montantEstime: p.voirPrix && montantChiffres ? Number(montantChiffres) : undefined,
      confirmee: true,
      restitutionPrevue: retourValable(valeurs, maintenant) ?? undefined,
      // D7 : le kilométrage tapé pour un nouveau véhicule est aussi le relevé du dépôt (champ de « Déjà au garage » sinon).
      kmDepot: km ?? (!valeurs.dejaAuGarage && choixVehicule.mode !== 'existant' ? versVehicule(valeursVehicule).km : undefined),
      // Création puis réception, par le dépôt (deux écritures) : « Ajouter et réceptionner ».
      dejaAuGarage: valeurs.dejaAuGarage || undefined,
    };
    setEnCours(true);
    setErreurGlobale(null);
    try {
      let cree: Intervention;
      // La fiche existe même si la réception échoue : l'avis le dit (« Ajouté, mais pas encore réceptionné »).
      let receptionEchouee = false;
      try {
        cree = await repo().creerIntervention(n, membre.id);
      } catch (err) {
        if (!(err instanceof ReceptionEchouee)) throw err;
        cree = err.intervention;
        receptionEchouee = true;
      }
      if (appelId && !appelDejaLie) {
        // La fiche existe : un échec de la liaison ne doit pas la cacher à l'utilisateur.
        await repo().lierAppel(appelId, cree.id).catch(() => {});
      }
      impulsion('succes');
      enregistree.current = true;
      if (depuisPlanning) {
        // Le planning se place sur le jour du créneau et propose « Ouvrir ».
        // Voiture avec sa plaque, comme tous les avis (§ 1.6 de la spécification).
        signalerAjout({ intervention: cree, vehicule: [nomVehicule, plaqueVehicule].filter(Boolean).join(' '), receptionEchouee });
        // Assistant ouvert sans écran derrière (page web rechargée) : retour au planning (R1).
        if (router.canGoBack()) router.back();
        else router.replace('/planning');
      } else if (p.voirTout || cree.membreId === membre.id) router.replace(`/intervention/${cree.id}`);
      // Sans « voir tout », une fiche confiée à un autre n'est pas visible par son
      // créateur : on revient en arrière plutôt que d'ouvrir « introuvable ».
      else if (router.canGoBack()) router.back();
      else router.replace('/planning');
    } catch (err) {
      setErreurGlobale((err as Error).message || 'Impossible d’ajouter l’intervention pour le moment.');
      setEnCours(false);
    }
  }

  // ── Rendu

  if (!p.creer) {
    return (
      <Ecran sansHaut>
        <Vide
          icone="cadenas"
          titre="Création réservée"
          texte="Votre gérant peut vous donner la permission « Créer des interventions »."
          action={
            <Bouton variante="secondaire" onPress={() => router.back()}>
              Fermer
            </Bouton>
          }
        />
      </Ecran>
    );
  }

  const formulaireVehicule = etape === 2 && (autreVehicule || vehiculesClient.length === 0);

  // ── Doublons (P4), sur les seules données visibles du membre, chacun écartable par « Créer quand même »
  const mobileConnu =
    etape === 1 && nouveauClient && natureTelephone(valeursClient.telephone) !== 'invente'
      ? clientDuMobile(clientsVus, valeursClient.telephone)
      : undefined;
  const doublonMobile = mobileConnu && !ecartes.includes(`mobile:${mobileConnu.id}`) ? mobileConnu : undefined;
  const plaqueConnue = formulaireVehicule ? vehiculeDeLaPlaque(vehiculesVus, valeursVehicule.plaque) : undefined;
  const doublonPlaque = plaqueConnue && !ecartes.includes(`plaque:${plaqueConnue.id}`) ? plaqueConnue : undefined;
  // Pendant l’enregistrement, la fiche qu’on vient de créer ne se signale pas comme doublon d’elle-même (R1).
  const ouverte =
    etape === 3 && !enCours && choixVehicule?.mode === 'existant' ? interventionOuverte(interventionsVues, choixVehicule.vehicule.id) : undefined;
  const doublonOuverte = ouverte && !ecartes.includes(`ouverte:${ouverte.id}`) ? ouverte : undefined;

  let bandeau: string | null = null;
  let secondaire: ActionPied | null = null;
  let principal: ActionPied | null = null;
  if (etape === 1 && nouveauClient) {
    principal = { libelle: 'Continuer', onPress: continuerNouveauClient };
    if (doublonMobile) {
      bandeau = phraseMobileConnu(doublonMobile);
      secondaire = {
        libelle: 'Créer quand même',
        onPress: () => {
          ecarter(`mobile:${doublonMobile.id}`);
          continuerNouveauClient();
        },
      };
      principal = {
        libelle: 'Utiliser sa fiche',
        onPress: () => {
          setNouveauClient(false);
          choisirClient(doublonMobile);
        },
      };
    }
  } else if (formulaireVehicule) {
    principal = { libelle: 'Continuer', onPress: continuerAutreVehicule };
    if (doublonPlaque) {
      const proprietaire = clients.find((c) => c.id === doublonPlaque.clientId);
      const creerQuandMeme: ActionPied = {
        libelle: 'Créer quand même',
        onPress: () => {
          ecarter(`plaque:${doublonPlaque.id}`);
          continuerAutreVehicule();
        },
      };
      bandeau = phrasePlaqueConnue(doublonPlaque, proprietaire);
      // Même client : c'est sa voiture, déjà enregistrée. Autre client : on ne lui prend pas sa voiture.
      if (choixClient?.mode === 'existant' && choixClient.client.id === doublonPlaque.clientId) {
        secondaire = creerQuandMeme;
        principal = {
          libelle: 'Utiliser ce véhicule',
          onPress: () => {
            setAutreVehicule(false);
            choisirVehicule(doublonPlaque);
          },
        };
      } else principal = creerQuandMeme;
    }
  } else if (etape === 3) {
    principal = { libelle: valeurs.dejaAuGarage ? 'Ajouter et réceptionner' : 'Ajouter au planning', onPress: enregistrer, chargement: enCours };
    if (doublonOuverte) {
      bandeau = phraseInterventionOuverte(doublonOuverte);
      secondaire = { libelle: 'Ouvrir', onPress: () => ouvrirExistante(doublonOuverte) };
      principal = {
        libelle: 'Créer quand même',
        chargement: enCours,
        onPress: () => {
          ecarter(`ouverte:${doublonOuverte.id}`);
          return enregistrer();
        },
      };
    }
  }
  const pied = principal ? (
    <>
      {bandeau ? <BandeauDoublon texte={bandeau} action={secondaire} /> : null}
      <Bouton onPress={principal.onPress} chargement={principal.chargement}>
        {principal.libelle}
      </Bouton>
    </>
  ) : null;

  const nomClient =
    choixClient?.mode === 'existant'
      ? nomDuClient(choixClient.client, '')
      : nomDuClient(valeursClient, '');
  const telClient = choixClient?.mode === 'existant' ? choixClient.client.telephone : valeursClient.telephone;
  const vehiculeChoisi = choixVehicule?.mode === 'existant' ? choixVehicule.vehicule : null;
  const nomVehicule = vehiculeChoisi ? libelleVehicule(vehiculeChoisi) : libelleVehicule({ marque: valeursVehicule.marque.trim(), modele: valeursVehicule.modele.trim() });
  const plaqueVehicule = vehiculeChoisi ? vehiculeChoisi.plaque : formaterPlaque(valeursVehicule.plaque);

  return (
    <Ecran sansHaut>
      <View style={{ paddingTop: Platform.OS === 'ios' ? 8 : insets.top }}>
        <View className="flex-row items-center justify-between px-4 py-3">
          <SousTitre>Nouvelle intervention</SousTitre>
          <BoutonRond nom="fermer" label="Fermer" onPress={() => router.back()} />
        </View>
        <Etapes courante={etape} onAller={aller} />
      </View>

      <KeyboardAwareScrollView
        ref={defilement}
        bottomOffset={pied ? ecartPied : 24}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 }}>
        {etape > 1 && choixClient ? (
          <Groupe titre="Récapitulatif">
            <Ligne onPress={() => aller(1)} derniere={etape === 2} accessibilityLabel={`Client ${nomClient}, modifier`}>
              {choixClient.mode === 'existant' ? (
                <AvatarClient client={choixClient.client} taille={36} />
              ) : (
                <View className="h-9 w-9 items-center justify-center rounded-full bg-surface2 dark:bg-surface2-dark">
                  <Icone nom="plus" taille={16} couleur={t.muted} />
                </View>
              )}
              <View className="flex-1">
                <Texte numberOfLines={1} className="font-semibold">
                  {nomClient}
                </Texte>
                <Secondaire numberOfLines={1}>
                  {choixClient.mode === 'nouveau' ? 'Nouveau client · ' : ''}
                  {telClient.trim() ? formaterTelephone(telClient) : 'Mobile à compléter'}
                </Secondaire>
              </View>
              <Icone nom="chevron.droite" taille={16} couleur={t.faint} />
            </Ligne>
            {etape === 3 && choixVehicule ? (
              <Ligne onPress={() => aller(2)} derniere accessibilityLabel={`Véhicule ${nomVehicule}, modifier`}>
                <View className="h-9 w-9 items-center justify-center rounded-full bg-surface2 dark:bg-surface2-dark">
                  <Icone nom="voiture" taille={18} couleur={t.muted} />
                </View>
                <View className="flex-1">
                  <Texte numberOfLines={1} className="font-semibold">
                    {nomVehicule}
                  </Texte>
                  <Secondaire numberOfLines={1}>{choixVehicule.mode === 'nouveau' ? 'Nouveau véhicule' : vehiculeChoisi?.version ?? 'Véhicule du client'}</Secondaire>
                </View>
                <Mono>{plaqueVehicule}</Mono>
                <Icone nom="chevron.droite" taille={16} couleur={t.faint} />
              </Ligne>
            ) : null}
          </Groupe>
        ) : null}

        {etape === 1 ? (
          <EtapeClient
            fiches={fiches}
            requete={requete}
            onRequete={setRequete}
            nouveau={nouveauClient}
            onNouveau={(saisie) => {
              // Ce qui a été tapé s'ajoute à ce qui est déjà connu (numéro venu d'un appel) sans l'effacer ;
              // un nom tapé dans la recherche remplace celui de l'appel en entier (prénom compris).
              const noms = saisie.prenom || saisie.nom ? { prenom: '', nom: '' } : {};
              setValeursClient((v) => fusionnerSansVide({ ...v, ...noms }, saisie));
              if (saisie.plaque) setValeursVehicule((v) => fusionnerSansVide(v, { plaque: saisie.plaque }));
              setErreursClient({});
              setNouveauClient(true);
            }}
            onRetourListe={() => setNouveauClient(false)}
            valeurs={valeursClient}
            onChangeValeurs={(v) => {
              // Un numéro corrigé efface son erreur : la légende (fixe, à compléter) reprend sa place.
              if (v.telephone !== valeursClient.telephone && erreursClient.telephone) setErreursClient(({ telephone: _t, ...reste }) => reste);
              setValeursClient(v);
            }}
            erreurs={erreursClient}
            onChoisir={choisirClient}
            onContinuer={continuerNouveauClient}
            plaqueConnue={depart.plaqueConnue}
          />
        ) : null}

        {etape === 2 ? (
          <EtapeVehicule
            vehicules={vehiculesClient}
            autre={autreVehicule}
            onAutre={() => {
              setErreursVehicule({});
              setAutreVehicule(true);
            }}
            onRetourListe={() => setAutreVehicule(false)}
            valeurs={valeursVehicule}
            onChangeValeurs={setValeursVehicule}
            erreurs={erreursVehicule}
            onChoisir={choisirVehicule}
            onContinuer={continuerAutreVehicule}
          />
        ) : null}

        {etape === 3 ? (
          <View onLayout={(e) => (origineEtape.current = e.nativeEvent.layout.y)}>
            <EtapeIntervention
              valeurs={valeurs}
              onChange={setValeurs}
              erreurs={erreurs}
              garage={garage}
              membres={equipe}
              voirPrix={p.voirPrix}
              plusTard={p.voirTout}
              onPosition={(bloc, y) => (positions.current[bloc] = y)}
              kmConnu={vehiculeChoisi ? vehiculeChoisi.km : versVehicule(valeursVehicule).km}
              kmLe={vehiculeChoisi ? dernierReleve(vehiculeChoisi, interventions)?.le : undefined}
              kmNouveauVehicule={!vehiculeChoisi}
            />
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      {pied ? (
        // Collé au clavier ouvert ; la marge de la zone sûre passe alors sous le clavier.
        <KeyboardStickyView offset={{ opened: insets.bottom }}>
          <View
            className="border-t border-line bg-bg px-4 pt-3 dark:border-line-dark dark:bg-bg-dark"
            style={{ paddingBottom: insets.bottom + 12 }}
            onLayout={(e) => setHauteurPied(e.nativeEvent.layout.height)}>
            <View className="w-full self-center" style={{ maxWidth: LARGEUR_MAX }}>
              {erreurGlobale ? <Erreur className="mb-2">{erreurGlobale}</Erreur> : null}
              {pied}
            </View>
          </View>
        </KeyboardStickyView>
      ) : null}

      <FeuilleConfirmation
        ouverte={sortie !== null}
        onFermer={() => setSortie(null)}
        titre="Abandonner la saisie ?"
        texte="Le client, le véhicule et le créneau choisis ne seront pas enregistrés."
        libelle="Abandonner"
        variante="danger"
        onConfirmer={() => {
          const action = sortie;
          setSortie(null);
          // La feuille se ferme d'abord : deux fermetures simultanées se gênent sur iOS.
          if (action) setTimeout(() => navigation.dispatch(action), 240);
        }}
      />
    </Ecran>
  );
}
