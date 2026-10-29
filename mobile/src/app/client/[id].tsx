/**
 * Fiche client : coordonnées cliquables, mémo modifiable en place (par toute
 * l'équipe qui voit le client), véhicules (kilométrage modifiable, ajout avec
 * la permission creer), historique des interventions, action principale
 * « Nouvelle intervention » ancrée en bas.
 *
 * v2c (D6) : le mobile est facultatif. Sans numéro (ou avec un numéro qui ne
 * tient pas), la ligne « Mobile à compléter » ouvre la modification du
 * client ; l’appel n’est proposé qu’avec un numéro valide, le SMS (lien
 * `sms:`) qu’avec un mobile. Chaque intervention montre sa plaque, et son
 * kilométrage au dépôt une fois close.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConsultationFiche } from '@/components/consultation';
import { CarteVehicule } from '@/components/clients/CarteVehicule';
import { FormulaireClient, LEGENDE_NUMERO_ETRANGER, LEGENDE_NUMERO_FIXE, validerClient, versClient, type ErreursClient, type ValeursClient } from '@/components/clients/FormulaireClient';
import { FormulaireVehicule, VEHICULE_VIDE, validerVehicule, versVehicule, type ErreursVehicule, type ValeursVehicule } from '@/components/clients/FormulaireVehicule';
import { LigneIntervention } from '@/components/clients/LigneIntervention';
import { ModaleFormulaire } from '@/components/clients/ModaleFormulaire';
import { interventionsVisibles, mobileJoignable, pluriel, telephoneAppelable, telephoneComposable } from '@/components/clients/outils';
import { Avis, useAvis } from '@/components/intervention/Avis';
import { phrasePlaqueConnue, vehiculeDeLaPlaque } from '@/components/nouvelle-intervention/doublons';
import { Bouton, Champ, Ecran, Erreur, Groupe, Icone, LARGEUR_MAX, Legende, Ligne, Secondaire, Section, Texte, Titre, Vide, impulsion } from '@/components/ui';
import { BarreClavier, HAUTEUR_BARRE_CLAVIER } from '@/components/ui/barre-clavier';
import { repo } from '@/data';
import { dePrenom, formaterTelephone, mailtoHref, nomClient, numeroLien, telHref } from '@/lib/format';
import { useDonnees, useMembre, usePermissions } from '@/state/session';
import { useTheme } from '@/theme/tokens';

export default function FicheClient() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const membre = useMembre();
  const p = usePermissions();
  const [avis, montrerAvis] = useAvis();

  const client = useDonnees((s) => s.clients.find((c) => c.id === id));
  const vehicules = useDonnees((s) => s.vehicules);
  const clients = useDonnees((s) => s.clients);
  const interventions = useDonnees((s) => s.interventions);

  const mesVehicules = useMemo(() => vehicules.filter((v) => v.clientId === id), [vehicules, id]);
  const toutesInterventions = useMemo(() => interventions.filter((i) => i.clientId === id), [interventions, id]);
  const mesInterventions = useMemo(
    () =>
      interventionsVisibles(toutesInterventions, membre, p)
        .sort((a, b) => b.debut.localeCompare(a.debut)),
    [toutesInterventions, membre, p],
  );

  // Mémo modifié en place, enregistré au blur.
  const [memo, setMemo] = useState(client?.memo ?? '');
  const [memoEnregistre, setMemoEnregistre] = useState(false);

  // Ajout d'un véhicule.
  const [modale, setModale] = useState(false);
  const [valeurs, setValeurs] = useState<ValeursVehicule>(VEHICULE_VIDE);
  const [erreurs, setErreurs] = useState<ErreursVehicule>({});
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Modification du client (« Mobile à compléter ») : prénom, nom, mobile.
  const [modaleClient, setModaleClient] = useState(false);
  const [valeursClient, setValeursClient] = useState<ValeursClient | null>(null);
  const [initialesClient, setInitialesClient] = useState<ValeursClient | null>(null);
  const [erreursClient, setErreursClient] = useState<ErreursClient>({});
  const [erreurClient, setErreurClient] = useState<string | null>(null);
  const [enCoursClient, setEnCoursClient] = useState(false);

  // Même règle que clientsVisibles : tout avec voirTout, sinon les clients de
  // ses interventions et ceux qui n'en ont encore aucune (fiche juste créée).
  const visible = client && (p.voirTout || mesInterventions.length > 0 || toutesInterventions.length === 0);
  if (!client || !visible) {
    return (
      <Ecran sansHaut>
        <Vide
          icone="clients"
          titre="Client introuvable"
          texte="Cette fiche n’est pas disponible."
          action={
            <Bouton variante="secondaire" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/clients'))}>
              Retour
            </Bouton>
          }
        />
      </Ecran>
    );
  }

  async function enregistrerMemo() {
    if (!client) return;
    const texte = memo.trim();
    if (texte === (client.memo ?? '')) return;
    try {
      await repo().modifierClient(client.id, { memo: texte || undefined });
      impulsion('leger');
      setMemoEnregistre(true);
      setTimeout(() => setMemoEnregistre(false), 1800);
    } catch (e) {
      // le mémo reste à l'écran, l'utilisateur peut réessayer
      montrerAvis((e as Error).message || 'Le mémo n’a pas pu être enregistré.');
    }
  }

  function ouvrirModale() {
    setValeurs(VEHICULE_VIDE);
    setErreurs({});
    setErreurGlobale(null);
    setModale(true);
  }

  // Doublon (P4, comme l’assistant) : une plaque déjà enregistrée le dit avant l’enregistrement, sans bloquer.
  const plaqueConnue = modale ? vehiculeDeLaPlaque(vehicules, valeurs.plaque) : undefined;
  const proprietaire = plaqueConnue ? clients.find((c) => c.id === plaqueConnue.clientId) : undefined;

  async function ajouterVehicule() {
    if (!client) return;
    const e = validerVehicule(valeurs);
    setErreurs(e);
    if (Object.keys(e).length) {
      impulsion('erreur');
      return;
    }
    setEnCours(true);
    setErreurGlobale(null);
    try {
      await repo().creerVehicule({ clientId: client.id, ...versVehicule(valeurs) });
      impulsion('succes');
      setModale(false);
    } catch (err) {
      setErreurGlobale((err as Error).message || 'Impossible d’enregistrer le véhicule pour le moment.');
    } finally {
      setEnCours(false);
    }
  }

  function ouvrirModaleClient() {
    if (!client) return;
    const depart: ValeursClient = {
      prenom: client.prenom,
      nom: client.nom,
      telephone: client.telephone,
      email: client.email ?? '',
      memo: client.memo ?? '',
    };
    setValeursClient(depart);
    setInitialesClient(depart);
    setErreursClient({});
    setErreurClient(null);
    setModaleClient(true);
  }

  async function enregistrerClient() {
    if (!client || !valeursClient) return;
    const e = validerClient(valeursClient);
    setErreursClient(e);
    if (Object.keys(e).length) {
      impulsion('erreur');
      return;
    }
    setEnCoursClient(true);
    setErreurClient(null);
    try {
      // Seuls les champs du formulaire : le mémo se modifie en place, sur la fiche.
      const { prenom, nom, telephone } = versClient(valeursClient);
      await repo().modifierClient(client.id, { prenom, nom, telephone });
      impulsion('succes');
      setModaleClient(false);
      const nouveauNumero = telephone && telephone !== formaterTelephone(client.telephone);
      montrerAvis(`${nouveauNumero ? 'Numéro enregistré' : 'Fiche client enregistrée'} · ${prenom} ${nom}`);
    } catch (err) {
      setErreurClient((err as Error).message || 'Impossible d’enregistrer le client pour le moment.');
    } finally {
      setEnCoursClient(false);
    }
  }

  const plusieursVehicules = mesVehicules.length > 1;
  const telephone = client.telephone.trim();
  // L’appel accepte tout numéro composable (étranger compris) ; le SMS, un mobile français seulement.
  const appelable = telephoneComposable(telephone);
  const mobile = mobileJoignable(telephone);
  // Sous « Mobile à compléter » : pourquoi pas de SMS (fixe, numéro étranger), ou le numéro enregistré qui ne tient pas.
  const aideMobile = mobile
    ? null
    : telephoneAppelable(telephone)
      ? LEGENDE_NUMERO_FIXE
      : appelable
        ? LEGENDE_NUMERO_ETRANGER
        : telephone
          ? `${telephone} : numéro à vérifier`
          : null;
  const clientModifie =
    valeursClient !== null &&
    initialesClient !== null &&
    (Object.keys(valeursClient) as (keyof ValeursClient)[]).some((k) => valeursClient[k] !== initialesClient[k]);

  return (
    <Ecran sansHaut>
      <KeyboardAwareScrollView
        bottomOffset={Math.max(p.creer ? 96 : 24, HAUTEUR_BARRE_CLAVIER + 24)}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: Platform.OS === 'ios' ? 8 : 16,
          paddingBottom: 32,
          maxWidth: LARGEUR_MAX,
          width: '100%',
          alignSelf: 'center',
        }}>
        <Titre className="text-[30px] leading-[36px]">
          {nomClient(client)}
        </Titre>
        <ConsultationFiche fiche={`client:${client.id}`} className="mt-3" />

        <Groupe className="mt-5">
          {appelable ? (
            <Ligne
              onPress={() => void Linking.openURL(telHref(telephone))}
              derniere={false}
              accessibilityLabel={`Appeler ${formaterTelephone(telephone)}`}>
              <Texte ton="accent" className="flex-1 font-mono">
                {formaterTelephone(telephone)}
              </Texte>
              <Icone nom="telephone" taille={20} couleur={t.ok} />
            </Ligne>
          ) : null}
          {mobile ? (
            <Ligne
              onPress={() => void Linking.openURL(`sms:${numeroLien(telephone)}`)}
              derniere={!client.email}
              accessibilityLabel={`Envoyer un SMS au ${formaterTelephone(telephone)}`}>
              <Texte ton="accent" className="flex-1">
                Envoyer un SMS
              </Texte>
              <Icone nom="message" taille={20} couleur={t.accent} />
            </Ligne>
          ) : (
            // Pas de mobile (D6) : aucun numéro, un fixe, ou un numéro qui ne tient pas. La ligne ouvre la modification.
            <Ligne
              onPress={ouvrirModaleClient}
              derniere={!client.email}
              accessibilityLabel={`Mobile à compléter${aideMobile ? `, ${aideMobile.replace(/\.$/, '')}` : ''}. Modifier`}>
              <View className="flex-1">
                <Texte ton="warn" className="font-semibold">
                  Mobile à compléter
                </Texte>
                {aideMobile ? (
                  <Legende numberOfLines={2} className="mt-0.5">
                    {aideMobile}
                  </Legende>
                ) : null}
              </View>
              <Icone nom="chevron.droite" taille={16} couleur={t.faint} />
            </Ligne>
          )}
          {client.email ? (
            <Ligne onPress={() => void Linking.openURL(mailtoHref(client.email ?? ''))} derniere accessibilityLabel={`Écrire à ${client.email}`}>
              <Texte ton="accent" numberOfLines={1} className="flex-1">
                {client.email}
              </Texte>
              <Icone nom="lien" taille={20} couleur={t.accent} />
            </Ligne>
          ) : null}
        </Groupe>

        <Champ
          libelle="Mémo interne"
          type="multiligne"
          value={memo}
          onChangeText={setMemo}
          onBlur={enregistrerMemo}
          placeholder="Un rappel utile pour l’équipe…"
          aide={memoEnregistre ? 'Enregistré.' : undefined}
          className="mb-6"
        />

        <Section titre="Véhicules">
          <Animated.View layout={LinearTransition.duration(220)} className="gap-2">
            {mesVehicules.map((v) => (
              <Animated.View key={v.id} entering={FadeIn.duration(200)} layout={LinearTransition.duration(220)}>
                <CarteVehicule
                  vehicule={v}
                  onModifierKm={(km) =>
                    repo()
                      .modifierVehicule(v.id, { km })
                      .catch((e: Error) => montrerAvis(e.message || 'Le kilométrage n’a pas pu être enregistré.'))
                  }
                />
              </Animated.View>
            ))}
            {mesVehicules.length === 0 ? <Secondaire className="ml-1 mb-1">Aucun véhicule connu pour ce client.</Secondaire> : null}
            {p.creer ? (
              <Bouton variante="secondaire" icone={<Icone nom="plus" taille={18} />} onPress={ouvrirModale}>
                Ajouter un véhicule
              </Bouton>
            ) : null}
          </Animated.View>
        </Section>

        {mesInterventions.length ? (
          <Groupe titre={pluriel(mesInterventions.length, 'intervention')}>
            {mesInterventions.map((i, idx) => (
              <LigneIntervention
                key={i.id}
                intervention={i}
                vehicule={mesVehicules.find((v) => v.id === i.vehiculeId)}
                avecModele={plusieursVehicules}
                voirPrix={p.voirPrix}
                derniere={idx === mesInterventions.length - 1}
                onPress={() => router.push(`/intervention/${i.id}`)}
              />
            ))}
          </Groupe>
        ) : (
          <Section titre="Interventions">
            <Secondaire className="ml-1">Aucune intervention pour l’instant.</Secondaire>
          </Section>
        )}
      </KeyboardAwareScrollView>

      {p.creer ? (
        <View className="border-t border-line bg-bg px-4 pt-3 dark:border-line-dark dark:bg-bg-dark" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="w-full self-center" style={{ maxWidth: LARGEUR_MAX }}>
            <Bouton onPress={() => router.push({ pathname: '/nouvelle-intervention', params: { clientId: client.id } })}>Nouvelle intervention</Bouton>
          </View>
        </View>
      ) : null}

      <ModaleFormulaire
        ouverte={modale}
        onFermer={() => setModale(false)}
        titre="Ajouter un véhicule"
        pied={
          <View>
            {erreurGlobale ? <Erreur className="mb-3">{erreurGlobale}</Erreur> : null}
            {plaqueConnue ? (
              <>
                <Legende ton="warn" className="mb-3" accessibilityLiveRegion="polite">
                  {phrasePlaqueConnue(plaqueConnue, proprietaire)}
                </Legende>
                <Bouton
                  onPress={() => {
                    setModale(false);
                    // Le véhicule est peut-être déjà sur cette fiche : on y reste ; sinon, la fiche de son propriétaire.
                    if (proprietaire && proprietaire.id !== client?.id) router.push(`/client/${proprietaire.id}`);
                  }}
                  accessibilityLabel={proprietaire && proprietaire.id !== client?.id ? `Ouvrir la fiche ${dePrenom(nomClient(proprietaire))}` : 'Revenir au véhicule déjà enregistré'}>
                  {proprietaire && proprietaire.id !== client?.id ? 'Ouvrir sa fiche' : 'Ne pas l’ajouter'}
                </Bouton>
                <Bouton variante="discret" className="mt-2" onPress={ajouterVehicule} chargement={enCours}>
                  Enregistrer quand même
                </Bouton>
              </>
            ) : (
              <Bouton onPress={ajouterVehicule} chargement={enCours}>
                Enregistrer le véhicule
              </Bouton>
            )}
          </View>
        }>
        <FormulaireVehicule valeurs={valeurs} onChange={setValeurs} erreurs={erreurs} autoFocus onSubmit={ajouterVehicule} />
      </ModaleFormulaire>
      <ModaleFormulaire
        ouverte={modaleClient}
        onFermer={() => setModaleClient(false)}
        titre="Modifier le client"
        vide={!clientModifie && !enCoursClient}
        pied={
          <View>
            {erreurClient ? <Erreur className="mb-3">{erreurClient}</Erreur> : null}
            <Bouton onPress={enregistrerClient} chargement={enCoursClient}>
              Enregistrer
            </Bouton>
          </View>
        }>
        {valeursClient ? (
          <FormulaireClient valeurs={valeursClient} onChange={setValeursClient} erreurs={erreursClient} onSubmit={enregistrerClient} />
        ) : null}
      </ModaleFormulaire>
      {/* Le kilométrage s’ouvre sur un pavé numérique sans touche de validation : « OK » au-dessus du clavier. */}
      <BarreClavier />
      <Avis texte={avis} flottant />
    </Ecran>
  );
}
