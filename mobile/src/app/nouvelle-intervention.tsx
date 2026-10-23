/**
 * Nouvelle intervention (comptoir) : trois étapes dans un seul écran
 * modal. Client existant ou nouveau, véhicule connu ou autre, puis la
 * prestation, le créneau, la durée, le mécanicien. Arrive directement en
 * « Rendez-vous confirmé » dans le planning.
 *
 * Paramètres : `clientId` (depuis la fiche client), ou `telephone` et
 * `appelId` (depuis la fiche d'un appel « rappel demandé » : le client est
 * retrouvé par son numéro, sinon le formulaire s'ouvre prérempli, et
 * l'appel est relié à la fiche créée).
 */

import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarClient } from '@/components/clients/AvatarClient';
import { CLIENT_VIDE, validerClient, versClient, type ErreursClient, type ValeursClient } from '@/components/clients/FormulaireClient';
import { VEHICULE_VIDE, validerVehicule, versVehicule, type ErreursVehicule, type ValeursVehicule } from '@/components/clients/FormulaireVehicule';
import { chiffresTelephone, clientsVisibles, fichesClients, interventionsVisibles, libelleVehicule } from '@/components/clients/outils';
import { DUREE_PAR_DEFAUT, joursProchains, premierCreneauLibre, premierJourDisponible } from '@/components/nouvelle-intervention/creneaux';
import { EtapeClient } from '@/components/nouvelle-intervention/EtapeClient';
import { EtapeIntervention, type ErreursIntervention, type ValeursIntervention } from '@/components/nouvelle-intervention/EtapeIntervention';
import { Etapes, type Etape } from '@/components/nouvelle-intervention/Etapes';
import { EtapeVehicule } from '@/components/nouvelle-intervention/EtapeVehicule';
import { Bouton, BoutonRond, Ecran, Erreur, FeuilleConfirmation, Groupe, Icone, LARGEUR_MAX, Ligne, Mono, Secondaire, SousTitre, Texte, Vide, impulsion } from '@/components/ui';
import { repo, type NouvelleIntervention as Nouvelle } from '@/data';
import type { Client, Vehicule } from '@/domain/types';
import { formaterPlaque, formaterTelephone } from '@/lib/format';
import { useDonnees, useMembre, usePermissions } from '@/state/session';
import { useTheme } from '@/theme/tokens';

type ChoixClient = { mode: 'existant'; client: Client } | { mode: 'nouveau' };
type ChoixVehicule = { mode: 'existant'; vehicule: Vehicule } | { mode: 'nouveau' };

export default function NouvelleIntervention() {
  const params = useLocalSearchParams<{ clientId?: string; telephone?: string; appelId?: string }>();
  const telephoneParam = params.telephone?.trim() || undefined;
  const appelId = params.appelId || undefined;
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

  const defilement = useRef<KeyboardAwareScrollViewRef>(null);

  // Client présélectionné : par identifiant (fiche client) ou par numéro (fiche
  // appel). Calculé une fois à l'ouverture : la sélection appartient ensuite à l'utilisateur.
  const [clientId] = useState<string | undefined>(() => {
    if (params.clientId) return params.clientId;
    if (!telephoneParam) return undefined;
    const chiffres = chiffresTelephone(telephoneParam);
    if (chiffres.length < 10) return undefined;
    return clientsVisibles(clients, interventions, membre, p).find((c) => chiffresTelephone(c.telephone) === chiffres)?.id;
  });

  // ── État du parcours
  const [choixClient, setChoixClient] = useState<ChoixClient | null>(() => {
    const c = clientId ? clients.find((x) => x.id === clientId) : undefined;
    return c ? { mode: 'existant', client: c } : null;
  });
  const [choixVehicule, setChoixVehicule] = useState<ChoixVehicule | null>(() => {
    const vs = clientId ? vehicules.filter((v) => v.clientId === clientId) : [];
    return vs.length === 1 ? { mode: 'existant', vehicule: vs[0] } : null;
  });
  const [etape, setEtape] = useState<Etape>(() => {
    if (!clientId || !clients.some((c) => c.id === clientId)) return 1;
    return vehicules.filter((v) => v.clientId === clientId).length === 1 ? 3 : 2;
  });

  // Numéro inconnu venu d'un appel : recherche préremplie et formulaire « Nouveau client » ouvert avec le mobile.
  const numeroInconnu = Boolean(telephoneParam && !clientId);
  const [requete, setRequete] = useState(numeroInconnu ? formaterTelephone(telephoneParam!) : '');
  const [nouveauClient, setNouveauClient] = useState(numeroInconnu);
  const [valeursClient, setValeursClient] = useState<ValeursClient>(() =>
    numeroInconnu ? { ...CLIENT_VIDE, telephone: formaterTelephone(telephoneParam!) } : CLIENT_VIDE,
  );
  const [erreursClient, setErreursClient] = useState<ErreursClient>({});

  const [autreVehicule, setAutreVehicule] = useState(false);
  const [valeursVehicule, setValeursVehicule] = useState<ValeursVehicule>(VEHICULE_VIDE);
  const [erreursVehicule, setErreursVehicule] = useState<ErreursVehicule>({});

  const [valeurs, setValeurs] = useState<ValeursIntervention>(() => {
    const jours = joursProchains(garage.horaires);
    const jour = premierJourDisponible(jours, garage.horaires) ?? jours[0];
    return {
      prestation: '',
      demande: '',
      jour: jour.cle,
      creneau: premierCreneauLibre(jour.date, garage.horaires)?.iso ?? null,
      dureeMin: DUREE_PAR_DEFAUT,
      // Sans « voir tout », une fiche sans mécanicien disparaîtrait de son planning : elle lui revient d'office.
      membreId: p.voirTout ? null : membre.id,
      prioritaire: false,
      memo: '',
      montant: '',
    };
  });
  const [erreurs, setErreurs] = useState<ErreursIntervention>({});
  const [enCours, setEnCours] = useState(false);
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);

  const fiches = useMemo(
    () => fichesClients(clientsVisibles(clients, interventions, membre, p), vehicules, interventionsVisibles(interventions, membre, p)),
    [clients, vehicules, interventions, membre, p],
  );
  const equipe = useMemo(() => membres.filter((m) => m.actif && !m.invitationEnAttente), [membres]);
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

  // Une erreur de l'étape 3 s'efface dès que le champ concerné est corrigé.
  useEffect(() => {
    setErreurs((e) => {
      if (!e.prestation && !e.creneau && !e.montant) return e;
      const n = { ...e };
      if (e.prestation && valeurs.prestation.trim()) delete n.prestation;
      if (e.creneau && valeurs.creneau) delete n.creneau;
      if (e.montant && (!valeurs.montant.trim() || /\d/.test(valeurs.montant))) delete n.montant;
      return n;
    });
  }, [valeurs.prestation, valeurs.creneau, valeurs.montant]);

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

  async function enregistrer() {
    if (!choixClient || !choixVehicule) return;
    const e: ErreursIntervention = {};
    if (!valeurs.prestation.trim()) e.prestation = 'Indiquez la prestation.';
    if (!valeurs.creneau) e.creneau = 'Choisissez un créneau.';
    const montantChiffres = valeurs.montant.replace(/[^\d]/g, '');
    if (valeurs.montant.trim() && !montantChiffres) e.montant = 'Montant en chiffres.';
    setErreurs(e);
    if (Object.keys(e).length || !valeurs.creneau) {
      impulsion('erreur');
      // Prestation et créneau sont en haut ; le montant, seul en bas, reste sous les yeux.
      if (e.prestation || e.creneau || !valeurs.creneau) defilement.current?.scrollTo({ y: 0, animated: true });
      else defilement.current?.scrollToEnd({ animated: true });
      return;
    }
    const n: Nouvelle = {
      client: choixClient.mode === 'existant' ? { id: choixClient.client.id } : versClient(valeursClient),
      vehicule: choixVehicule.mode === 'existant' ? { id: choixVehicule.vehicule.id } : versVehicule(valeursVehicule),
      prestation: valeurs.prestation.trim(),
      demande: valeurs.demande.trim() || undefined,
      debut: valeurs.creneau,
      dureeMin: valeurs.dureeMin,
      membreId: valeurs.membreId,
      origine: appelId ? 'telephone' : 'comptoir',
      prioritaire: valeurs.prioritaire,
      memo: valeurs.memo.trim() || undefined,
      montantEstime: p.voirPrix && montantChiffres ? Number(montantChiffres) : undefined,
      confirmee: true,
    };
    setEnCours(true);
    setErreurGlobale(null);
    try {
      const cree = await repo().creerIntervention(n, membre.id);
      if (appelId) {
        // La fiche existe : un échec de la liaison ne doit pas la cacher à l'utilisateur.
        await repo().lierAppel(appelId, cree.id).catch(() => {});
      }
      impulsion('succes');
      enregistree.current = true;
      // Sans « voir tout », une fiche confiée à un autre n'est pas visible par son
      // créateur : on revient au planning plutôt que d'ouvrir « introuvable ».
      if (p.voirTout || cree.membreId === membre.id) router.replace(`/intervention/${cree.id}`);
      else router.back();
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
  const pied =
    etape === 1 && nouveauClient ? (
      <Bouton onPress={continuerNouveauClient}>Continuer</Bouton>
    ) : formulaireVehicule ? (
      <Bouton onPress={continuerAutreVehicule}>Continuer</Bouton>
    ) : etape === 3 ? (
      <Bouton onPress={enregistrer} chargement={enCours}>
        Ajouter au planning
      </Bouton>
    ) : null;

  const nomClient =
    choixClient?.mode === 'existant'
      ? `${choixClient.client.prenom} ${choixClient.client.nom}`
      : `${valeursClient.prenom.trim()} ${valeursClient.nom.trim()}`.trim();
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
                  {formaterTelephone(telClient)}
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
            onNouveau={(initiales) => {
              setValeursClient({ ...CLIENT_VIDE, ...initiales });
              setErreursClient({});
              setNouveauClient(true);
            }}
            onRetourListe={() => setNouveauClient(false)}
            valeurs={valeursClient}
            onChangeValeurs={setValeursClient}
            erreurs={erreursClient}
            onChoisir={choisirClient}
            onContinuer={continuerNouveauClient}
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
          <EtapeIntervention valeurs={valeurs} onChange={setValeurs} erreurs={erreurs} garage={garage} membres={equipe} voirPrix={p.voirPrix} plusTard={p.voirTout} />
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
