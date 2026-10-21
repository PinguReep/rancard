/**
 * Fiche client : coordonnées cliquables, mémo modifiable en place,
 * véhicules (kilométrage modifiable, ajout), historique des interventions,
 * action principale « Nouvelle intervention » ancrée en bas.
 */

import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CarteVehicule } from '@/components/clients/CarteVehicule';
import { FormulaireVehicule, VEHICULE_VIDE, validerVehicule, versVehicule, type ErreursVehicule, type ValeursVehicule } from '@/components/clients/FormulaireVehicule';
import { LigneIntervention } from '@/components/clients/LigneIntervention';
import { ModaleFormulaire } from '@/components/clients/ModaleFormulaire';
import { interventionsVisibles, pluriel } from '@/components/clients/outils';
import { Avis, useAvis } from '@/components/intervention/Avis';
import { Bouton, Champ, Ecran, Erreur, Groupe, Icone, LARGEUR_MAX, Legende, Ligne, Secondaire, Section, Texte, Titre, Vide, impulsion } from '@/components/ui';
import { repo } from '@/data';
import { formaterTelephone, telHref } from '@/lib/format';
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

  const depuis = format(new Date(client.creeLe), 'MMMM yyyy', { locale: fr });
  const plusieursVehicules = mesVehicules.length > 1;

  return (
    <Ecran sansHaut>
      <KeyboardAwareScrollView
        bottomOffset={p.creer ? 96 : 24}
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
        <Titre>
          {client.prenom} {client.nom}
        </Titre>
        <Legende className="mt-1">Client depuis {depuis}</Legende>

        <Groupe className="mt-6" titre="Coordonnées">
          <Ligne
            onPress={() => void Linking.openURL(telHref(client.telephone))}
            derniere={!client.email}
            accessibilityLabel={`Appeler ${formaterTelephone(client.telephone)}`}>
            <View className="flex-1">
              <Legende>Mobile</Legende>
              <Texte ton="accent">{formaterTelephone(client.telephone)}</Texte>
            </View>
            <Icone nom="telephone" taille={20} couleur={t.accent} />
          </Ligne>
          {client.email ? (
            <Ligne onPress={() => void Linking.openURL(`mailto:${client.email}`)} derniere accessibilityLabel={`Écrire à ${client.email}`}>
              <View className="flex-1">
                <Legende>E-mail</Legende>
                <Texte ton="accent" numberOfLines={1}>
                  {client.email}
                </Texte>
              </View>
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
          aide={memoEnregistre ? 'Enregistré.' : 'Visible de l’équipe seulement, enregistré automatiquement.'}
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
            <Bouton variante="secondaire" icone={<Icone nom="plus" taille={18} />} onPress={ouvrirModale}>
              Ajouter un véhicule
            </Bouton>
          </Animated.View>
        </Section>

        {mesInterventions.length ? (
          <Groupe titre={pluriel(mesInterventions.length, 'intervention')}>
            {mesInterventions.map((i, idx) => (
              <LigneIntervention
                key={i.id}
                intervention={i}
                vehicule={plusieursVehicules ? mesVehicules.find((v) => v.id === i.vehiculeId) : undefined}
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
            <Bouton onPress={ajouterVehicule} chargement={enCours}>
              Enregistrer le véhicule
            </Bouton>
          </View>
        }>
        <FormulaireVehicule valeurs={valeurs} onChange={setValeurs} erreurs={erreurs} autoFocus onSubmit={ajouterVehicule} />
      </ModaleFormulaire>
      <Avis texte={avis} flottant />
    </Ecran>
  );
}
