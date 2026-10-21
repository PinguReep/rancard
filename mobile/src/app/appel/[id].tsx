/**
 * Fiche d'un appel traité par le réceptionniste : qui a appelé, quand,
 * le résumé automatique, la fiche créée s'il y en a une, et deux gestes :
 * rappeler, ou créer une intervention. Réservée à la permission
 * « Voir les appels », comme l'onglet.
 */

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Platform, Pressable, View } from 'react-native';

import { PastilleHorsHoraires, PastilleIssue } from '@/components/appels/PastilleIssue';
import { Bouton, Carte, Ecran, Icone, Legende, Mono, PastilleStatut, Section, Texte, Titre, Vide, impulsion } from '@/components/ui';
import { dureeSecondes, formaterTelephone, quand, telHref } from '@/lib/format';
import { useDonnees, usePermissions } from '@/state/session';
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
  const appel = useDonnees((s) => s.appels.find((a) => a.id === id));
  const intervention = useDonnees((s) => (appel?.interventionId ? s.interventions.find((i) => i.id === appel.interventionId) : undefined));
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
  const appeler = () => {
    impulsion('moyen');
    Linking.openURL(telHref(appel.numero)).catch(() => {
      // pas d'application téléphone disponible
    });
  };

  const numero = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Appeler le ${telephone}`}
      onPress={appeler}
      className="min-h-[44px] justify-center self-start active:opacity-70">
      {appel.appelant ? (
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

          {appel.appelant ? <Titre>{appel.appelant}</Titre> : null}
          {numero}
          <Legende className="mt-2">
            {quand(appel.debut)} · {dureeSecondes(appel.dureeSec)}
          </Legende>

          <View className="mt-6">
            <Bouton variante="secondaire" desactive icone={<Icone nom="message" taille={18} couleur={t.ink} />}>
              Réécouter l’enregistrement
            </Bouton>
            <Legende className="mt-2 text-center">
              {appel.enregistrementUrl ? 'Bientôt disponible' : 'Aucun enregistrement pour cet appel.'}
            </Legende>
          </View>

          <Section titre="Résumé automatique" className="mt-8">
            <Carte className="p-4">
              <Texte>{appel.resume}</Texte>
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
                      {[client ? `${client.prenom} ${client.nom}` : null, vehicule ? `${vehicule.marque} ${vehicule.modele}` : null]
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

          <View className="mt-2 gap-2">
            <Bouton onPress={appeler} icone={<Icone nom="telephone" taille={18} couleur={t.blanc} />}>
              Rappeler
            </Bouton>
            {!intervention && p.creer ? (
              <Bouton
                variante="secondaire"
                onPress={() => router.push({ pathname: '/nouvelle-intervention', params: { telephone: appel.numero, appelId: appel.id } })}>
                Créer une intervention
              </Bouton>
            ) : null}
          </View>
        </View>
      </Ecran>
    </>
  );
}
