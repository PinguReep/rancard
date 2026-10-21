/**
 * Onglet Clients : recherche (nom, plaque, téléphone, véhicule), liste
 * triée par nom, création d'un client. Un employé sans « voir tout » ne
 * voit que les clients de ses interventions.
 */

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { BarreRecherche } from '@/components/clients/BarreRecherche';
import { CLIENT_VIDE, FormulaireClient, validerClient, versClient, type ErreursClient, type ValeursClient } from '@/components/clients/FormulaireClient';
import { LigneClient } from '@/components/clients/LigneClient';
import { ModaleFormulaire } from '@/components/clients/ModaleFormulaire';
import { clientsVisibles, fichesClients, filtrerFiches, interventionsVisibles, type FicheClient } from '@/components/clients/outils';
import { Entete } from '@/components/entete';
import { Bouton, BoutonRond, Ecran, Erreur, Vide, impulsion, useMargeBasse } from '@/components/ui';
import { repo } from '@/data';
import { useDonnees, useMembre, usePermissions } from '@/state/session';

export default function Clients() {
  const router = useRouter();
  const membre = useMembre();
  const p = usePermissions();
  const clients = useDonnees((s) => s.clients);
  const vehicules = useDonnees((s) => s.vehicules);
  const interventions = useDonnees((s) => s.interventions);
  const margeBasse = useMargeBasse();

  const [requete, setRequete] = useState('');
  const [modale, setModale] = useState(false);
  const [valeurs, setValeurs] = useState<ValeursClient>(CLIENT_VIDE);
  const [erreurs, setErreurs] = useState<ErreursClient>({});
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const fiches = useMemo(
    () => fichesClients(clientsVisibles(clients, interventions, membre, p), vehicules, interventionsVisibles(interventions, membre, p)),
    [clients, vehicules, interventions, membre, p],
  );
  const resultats = useMemo(() => filtrerFiches(fiches, requete), [fiches, requete]);

  function ouvrirModale() {
    setValeurs(CLIENT_VIDE);
    setErreurs({});
    setErreurGlobale(null);
    setModale(true);
  }

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
      titre={`Rien pour « ${requete.trim()} »`}
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
        <BarreRecherche valeur={requete} onChange={setRequete} placeholder="Plaque, nom ou téléphone…" />
      </View>
      <FlashList<FicheClient>
        data={resultats}
        keyExtractor={(f) => f.client.id}
        extraData={resultats.length}
        renderItem={({ item, index }) => (
          <LigneClient
            fiche={item}
            premiere={index === 0}
            derniere={index === resultats.length - 1}
            onPress={() => router.push(`/client/${item.client.id}`)}
          />
        )}
        ListEmptyComponent={vide}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: margeBasse }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />

      <ModaleFormulaire
        ouverte={modale}
        onFermer={() => setModale(false)}
        titre="Nouveau client"
        pied={
          <View>
            {erreurGlobale ? <Erreur className="mb-3">{erreurGlobale}</Erreur> : null}
            <Bouton onPress={creer} chargement={enCours}>
              Enregistrer le client
            </Bouton>
          </View>
        }>
        <FormulaireClient valeurs={valeurs} onChange={setValeurs} erreurs={erreurs} complet autoFocus />
      </ModaleFormulaire>
    </Ecran>
  );
}
