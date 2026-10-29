/**
 * Fiche d'un appel traité par le réceptionniste : qui a appelé, quand, ce
 * que l'appelant a donné (nom, véhicule, plaque, kilométrage, motif, noté
 * pendant l'appel), le résumé automatique, la fiche créée s'il y en a une,
 * puis la conversation à réécouter (lecteur et fil des répliques, gardés
 * 90 jours), et deux gestes : rappeler, puis créer une intervention
 * préremplie (ou ouvrir celle qui existe déjà). Réservée à la permission
 * « Voir les appels », comme l'onglet.
 */

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Platform, Pressable, View } from 'react-native';

import { donneesAppelant } from '@/components/appels/donnees-appelant';
import { EcouteAppel } from '@/components/appels/EcouteAppel';
import { InfosAppelant, aDesInfos } from '@/components/appels/InfosAppelant';
import { PastilleHorsHoraires, PastilleIssue } from '@/components/appels/PastilleIssue';
import { normaliser } from '@/components/clients/outils';
import { appelEnDirect } from '@/domain/appels';
import { Bouton, Carte, Ecran, Icone, Legende, Mono, PastilleStatut, Secondaire, Section, Texte, Titre, Vide, impulsion } from '@/components/ui';
import { dureeSecondes, formaterTelephone, nomClient, quand, telHref } from '@/lib/format';
import { useDonnees, useMembre, usePermissions } from '@/state/session';
import { useTheme } from '@/theme/tokens';

/** Même en-tête natif que la fiche intervention, déclaré ici tant que la route n'est pas dans app/_layout.tsx. */
function EnTeteNatif() {
  return (
    <Stack.Screen
      options={{
        headerShown: true,
        headerTitle: '',
        headerBackTitle: 'Retour',
        headerTransparent: Platform.OS === 'ios',
        headerBlurEffect: 'regular',
      }}
    />
  );
}

export default function FicheAppel() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useTheme();
  const p = usePermissions();
  const membre = useMembre();
  const appel = useDonnees((s) => s.appels.find((a) => a.id === id));
  const garage = useDonnees((s) => s.garage);
  // Même règle que la fiche intervention : sans « voir tout », seulement les siennes.
  const intervention = useDonnees((s) => {
    const i = appel?.interventionId ? s.interventions.find((x) => x.id === appel.interventionId) : undefined;
    return i && (p.voirTout || i.membreId === membre.id) ? i : undefined;
  });
  const client = useDonnees((s) => (intervention ? s.clients.find((c) => c.id === intervention.clientId) : undefined));
  const vehicule = useDonnees((s) => (intervention ? s.vehicules.find((v) => v.id === intervention.vehiculeId) : undefined));

  const retour = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/planning'));
  const boutonRetour = (
    <Bouton variante="secondaire" onPress={retour}>
      Retour
    </Bouton>
  );

  if (!p.appels) {
    return (
      <>
        <EnTeteNatif />
        <Ecran sansHaut>
          <Vide
            icone="cadenas"
            titre="Accès réservé"
            texte="Les appels sont visibles avec la permission « Voir les appels ». Demandez-la au gérant."
            action={boutonRetour}
          />
        </Ecran>
      </>
    );
  }

  if (!appel) {
    return (
      <>
        <EnTeteNatif />
        <Ecran sansHaut>
          <Vide icone="appels" titre="Appel introuvable" texte="Cet appel n’existe plus ou a été retiré." action={boutonRetour} />
        </Ecran>
      </>
    );
  }

  const telephone = formaterTelephone(appel.numero);
  const appelerNumero = (numero: string) => {
    impulsion('moyen');
    Linking.openURL(telHref(numero)).catch(() => {
      // pas d'application téléphone disponible
    });
  };
  const appeler = () => appelerNumero(appel.numero);

  // Ce que l'appelant a donné pendant l'appel. Le nom dicté sert de titre faute de nom
  // retenu en fin d'appel ; il est repris dans la liste s'il en diffère ou reste à confirmer.
  const donnees = donneesAppelant(appel);
  const nom = appel.appelant || donnees.identite?.texte;
  const nomDansLaListe = Boolean(
    donnees.identite &&
      (!donnees.identite.confirme || (appel.appelant && normaliser(appel.appelant) !== normaliser(donnees.identite.texte))),
  );

  const numero = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Appeler le ${telephone}`}
      onPress={appeler}
      className="min-h-[44px] justify-center self-start active:opacity-70">
      {nom ? (
        <Texte ton="accent" className="mt-1">
          {telephone}
        </Texte>
      ) : (
        <Titre ton="accent">{telephone}</Titre>
      )}
    </Pressable>
  );

  return (
    <>
      <EnTeteNatif />
      <Ecran defilant sansHaut>
        <View className="px-4 pt-3">
          <View className="mb-3 flex-row flex-wrap items-center gap-2">
            <PastilleIssue issue={appel.issue} />
            {appel.horsHoraires ? <PastilleHorsHoraires /> : null}
          </View>

          {nom ? <Titre>{nom}</Titre> : null}
          {numero}
          <Legende className="mt-2">
            {quand(appel.debut)} · {dureeSecondes(appel.dureeSec)}
          </Legende>

          {/* Une action principale : rappeler, juste sous le numéro. La réécoute est en bas, avec le fil. */}
          <View className="mt-6 gap-2">
            <Bouton onPress={appeler} icone={<Icone nom="telephone" taille={18} couleur={t.blanc} />}>
              Rappeler
            </Bouton>
            {appel.interventionId ? (
              // Une fiche existe déjà (réceptionniste ou collègue) : on l'ouvre, on n'en crée pas une seconde.
              intervention ? (
                <Bouton variante="secondaire" onPress={() => router.push(`/intervention/${intervention.id}`)}>
                  Ouvrir la fiche
                </Bouton>
              ) : (
                <Legende className="mt-1 text-center">Une fiche a déjà été créée pour cet appel.</Legende>
              )
            ) : p.creer ? (
              <Bouton
                variante="secondaire"
                onPress={() => router.push({ pathname: '/nouvelle-intervention', params: { appelId: appel.id } })}>
                Créer une intervention
              </Bouton>
            ) : null}
          </View>

          <Section titre="Ce que l’appelant a donné" className="mt-8">
            <Carte className="p-4">
              {aDesInfos(donnees, nomDansLaListe) ? (
                <InfosAppelant donnees={donnees} avecIdentite={nomDansLaListe} onAppelerRappel={appelerNumero} />
              ) : (
                <Secondaire>Aucune information notée pendant l’appel.</Secondaire>
              )}
            </Carte>
          </Section>

          <Section titre="Résumé automatique">
            <Carte className="p-4">
              {appel.resume ? <Texte>{appel.resume}</Texte> : <Secondaire>Aucun compte rendu reçu pour cet appel.</Secondaire>}
            </Carte>
          </Section>

          {intervention ? (
            <Section titre="Fiche liée">
              <Carte
                className="p-4"
                onPress={() => router.push(`/intervention/${intervention.id}`)}
                accessibilityLabel={`Ouvrir l’intervention ${intervention.prestation}`}>
                <View className="flex-row items-center gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-surface2 dark:bg-surface2-dark">
                    <Icone nom="cle" taille={18} couleur={t.muted} />
                  </View>
                  <View className="flex-1">
                    <Texte className="font-semibold" numberOfLines={1}>
                      {intervention.prestation}
                    </Texte>
                    <Legende numberOfLines={1}>
                      {[client ? nomClient(client) : null, vehicule ? `${vehicule.marque} ${vehicule.modele}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Legende>
                  </View>
                  <Icone nom="chevron.droite" taille={16} couleur={t.faint} />
                </View>
                <View className="mt-3 flex-row flex-wrap items-center gap-2">
                  <PastilleStatut statut={intervention.statut} court />
                  {vehicule ? <Mono ton="muted">{vehicule.plaque}</Mono> : null}
                  <Legende>{quand(intervention.debut)}</Legende>
                </View>
              </Carte>
            </Section>
          ) : null}

          {/* En dernier : le fil peut être long. Rien pour un appel encore en direct (carte de l’onglet). */}
          {appelEnDirect(appel) ? null : (
            <Section titre="Conversation">
              <EcouteAppel appel={appel} garage={garage.nom} receptionnisteActif={garage.options.receptionniste} />
            </Section>
          )}
        </View>
      </Ecran>
    </>
  );
}
