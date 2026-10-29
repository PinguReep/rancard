/**
 * Onglet Clients : recherche (nom, plaque, téléphone, véhicule), liste
 * triée par nom, création d'un client. Un employé sans « voir tout » ne
 * voit que les clients de ses interventions.
 *
 * v2c (repris de la v2b), le téléphone du comptoir : chaque ligne dit où en
 * est la voiture visée par la requête et son appui ouvre l’intervention
 * active ; « Effacer » rend le focus au champ, et au retour d’une fiche la
 * requête reste, sélectionnée entière, prête à être retapée.
 */

import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, View, type TextInput } from 'react-native';

import { BarreRecherche } from '@/components/clients/BarreRecherche';
import { CLIENT_VIDE, FormulaireClient, validerClient, versClient, type ErreursClient, type ValeursClient } from '@/components/clients/FormulaireClient';
import { LigneClient } from '@/components/clients/LigneClient';
import { ModaleFormulaire } from '@/components/clients/ModaleFormulaire';
import {
  clientsVisibles,
  fichesClients,
  filtrerFiches,
  fusionnerSansVide,
  interventionsVisibles,
  resultatLigne,
  valeursDepuisRecherche,
  type FicheClient,
  type ResultatLigne,
} from '@/components/clients/outils';
import { Entete } from '@/components/entete';
import { clientDuMobile, phraseMobileConnu } from '@/components/nouvelle-intervention/doublons';
import { Bouton, BoutonRond, Ecran, Erreur, Legende, Vide, impulsion, useMargeBasse } from '@/components/ui';
import { repo } from '@/data';
import type { Evenement } from '@/domain/types';
import { dePrenom, nomClient } from '@/lib/format';
import { useDonnees, useMembre, usePermissions } from '@/state/session';

type LigneResultat = { fiche: FicheClient; resultat: ResultatLigne };

const AUCUN: Evenement[] = [];

export default function Clients() {
  const router = useRouter();
  const membre = useMembre();
  const p = usePermissions();
  const clients = useDonnees((s) => s.clients);
  const vehicules = useDonnees((s) => s.vehicules);
  const interventions = useDonnees((s) => s.interventions);
  const evenements = useDonnees((s) => s.evenements);
  const margeBasse = useMargeBasse();

  const [requete, setRequete] = useState('');
  // Heure des repères (« Prêt · 20 min ») : relue à chaque retour sur l’onglet et à chaque frappe.
  const [instant, setInstant] = useState(() => Date.now());
  const champ = useRef<TextInput>(null);
  // Une fiche ouverte depuis une ligne : au retour, le champ reprend le focus.
  const depuisFiche = useRef(false);
  const requeteCourante = useRef(requete);
  requeteCourante.current = requete;
  const [modale, setModale] = useState(false);
  const [valeurs, setValeurs] = useState<ValeursClient>(CLIENT_VIDE);
  // Valeurs à l'ouverture : tant que rien n'a changé, la feuille se ferme d'un glissement.
  const [initiales, setInitiales] = useState<ValeursClient>(CLIENT_VIDE);
  const [erreurs, setErreurs] = useState<ErreursClient>({});
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const fiches = useMemo(
    () => fichesClients(clientsVisibles(clients, interventions, membre, p), vehicules, interventionsVisibles(interventions, membre, p)),
    [clients, vehicules, interventions, membre, p],
  );
  const resultats = useMemo(() => filtrerFiches(fiches, requete), [fiches, requete]);
  const evenementsPar = useMemo(() => {
    const par = new Map<string, Evenement[]>();
    for (const e of evenements) {
      const liste = par.get(e.interventionId);
      if (liste) liste.push(e);
      else par.set(e.interventionId, [e]);
    }
    return par;
  }, [evenements]);
  const lignes = useMemo<LigneResultat[]>(() => {
    const ctx = { maintenant: new Date(instant), evenementsDe: (id: string) => evenementsPar.get(id) ?? AUCUN };
    return resultats.map((fiche) => ({ fiche, resultat: resultatLigne(fiche, requete, ctx) }));
  }, [resultats, requete, evenementsPar, instant]);

  useFocusEffect(
    useCallback(() => {
      setInstant(Date.now());
      if (!depuisFiche.current) return undefined;
      depuisFiche.current = false;
      if (!requeteCourante.current) return undefined;
      // Retour d’une fiche : la requête reste, sélectionnée entière (selectTextOnFocus), clavier ouvert.
      const minuteur = setTimeout(() => {
        champ.current?.focus();
      }, 120);
      return () => {
        clearTimeout(minuteur);
      };
    }, []),
  );

  function changerRequete(v: string) {
    setRequete(v);
    setInstant(Date.now());
  }

  function ouvrir({ fiche, resultat }: LigneResultat, ficheClient = false) {
    depuisFiche.current = true;
    if (!ficheClient && resultat.versIntervention && resultat.active) router.push(`/intervention/${resultat.active.id}`);
    else router.push(`/client/${fiche.client.id}`);
  }

  const formulaireVide = (Object.keys(valeurs) as (keyof ValeursClient)[]).every((k) => valeurs[k] === initiales[k]);

  function ouvrirModale() {
    // Recherche sans résultat : le formulaire reprend ce qui a été tapé (la
    // plaque, sans champ ici, attend la première intervention).
    const depart = requete.trim() && resultats.length === 0 ? fusionnerSansVide(CLIENT_VIDE, valeursDepuisRecherche(requete)) : CLIENT_VIDE;
    setValeurs(depart);
    setInitiales(depart);
    setErreurs({});
    setErreurGlobale(null);
    setModale(true);
  }

  // Doublon (P4, comme l’assistant) : un mobile déjà connu propose la fiche existante, sans bloquer.
  const doublon = modale ? clientDuMobile(clients, valeurs.telephone) : undefined;

  async function creer() {
    const e = validerClient(valeurs);
    setErreurs(e);
    if (Object.keys(e).length) {
      impulsion('erreur');
      return;
    }
    setEnCours(true);
    setErreurGlobale(null);
    try {
      const c = await repo().creerClient(versClient(valeurs));
      impulsion('succes');
      setModale(false);
      router.push(`/client/${c.id}`);
    } catch (err) {
      setErreurGlobale((err as Error).message || 'Impossible d’enregistrer le client pour le moment.');
    } finally {
      setEnCours(false);
    }
  }

  const vide = requete.trim() ? (
    <Vide
      icone="recherche"
      titre={`Rien pour « ${requete.trim()} »`}
      action={
        p.creer ? (
          <Bouton variante="secondaire" onPress={ouvrirModale}>
            Nouveau client
          </Bouton>
        ) : undefined
      }
    />
  ) : (
    <Vide
      icone="clients"
      titre="Aucun client"
      action={
        p.creer ? (
          <Bouton variante="secondaire" onPress={ouvrirModale}>
            Nouveau client
          </Bouton>
        ) : undefined
      }
    />
  );

  return (
    <Ecran>
      <Entete titre="Chercher" sansDate droite={p.creer ? <BoutonRond nom="plus" label="Nouveau client" onPress={ouvrirModale} accent /> : undefined} />
      <View className="px-4">
        <BarreRecherche valeur={requete} onChange={changerRequete} placeholder="Plaque, nom ou téléphone…" champRef={champ} selectionnerAuFocus />
      </View>
      <FlashList<LigneResultat>
        data={lignes}
        keyExtractor={(l) => l.fiche.client.id}
        // La requête choisit le véhicule montré, les événements et l’heure son état.
        extraData={lignes}
        renderItem={({ item, index }) => (
          <LigneClient
            fiche={item.fiche}
            resultat={item.resultat}
            premiere={index === 0}
            derniere={index === lignes.length - 1}
            onPress={() => ouvrir(item)}
            onFicheClient={() => ouvrir(item, true)}
          />
        )}
        ListEmptyComponent={vide}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: margeBasse }}
        keyboardShouldPersistTaps="handled"
        // Sur le web, « on-drag » fermait aussi le clavier au défilement que provoque le changement de hauteur
        // de la liste (le champ perdait le focus juste après « Effacer », L03) : seulement sur l’appareil.
        keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
      />

      <ModaleFormulaire
        ouverte={modale}
        onFermer={() => setModale(false)}
        titre="Nouveau client"
        vide={formulaireVide && !enCours}
        pied={
          <View>
            {erreurGlobale ? <Erreur className="mb-3">{erreurGlobale}</Erreur> : null}
            {doublon ? (
              <>
                <Legende ton="warn" className="mb-3" accessibilityLiveRegion="polite">
                  {phraseMobileConnu(doublon)}
                </Legende>
                <Bouton
                  onPress={() => {
                    setModale(false);
                    router.push(`/client/${doublon.id}`);
                  }}
                  accessibilityLabel={`Ouvrir la fiche ${dePrenom(nomClient(doublon))}`}>
                  Ouvrir sa fiche
                </Bouton>
                <Bouton variante="discret" className="mt-2" onPress={creer} chargement={enCours}>
                  Créer quand même
                </Bouton>
              </>
            ) : (
              <Bouton onPress={creer} chargement={enCours}>
                Enregistrer le client
              </Bouton>
            )}
          </View>
        }>
        <FormulaireClient valeurs={valeurs} onChange={setValeurs} erreurs={erreurs} complet autoFocus />
      </ModaleFormulaire>
    </Ecran>
  );
}
