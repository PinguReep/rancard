/**
 * Confidentialité : ce que l'app enregistre, pourquoi, où, combien de
 * temps, et les droits. Court et factuel, sans affirmation juridique : le
 * texte qui engage est la politique de confidentialité publiée sur
 * rencar.example (brouillon dans `site/confidentialite.html`), ouverte d’ici.
 * Les deux doivent dire la même chose : modifier l’un, relire l’autre.
 */

import { Stack } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LigneNavigation } from '@/components/profil/LigneNavigation';
import { Carte, Ecran, Groupe, Legende, Secondaire, Section, Texte, impulsion } from '@/components/ui';
import { BACKEND } from '@/data';
import { mailtoHref } from '@/lib/format';
import { CONSERVATION_ECOUTE_JOURS } from '@/domain/appels';
import { EMAIL_ASSISTANCE, URL_CONFIDENTIALITE, URL_MENTIONS_LEGALES, ouvrirPage } from '@/lib/liens';

type Bloc = { titre: string; texte: string };

const BLOCS: Bloc[] = [
  {
    titre: 'Ce qui est enregistré',
    texte:
      `L’identité des membres de l’équipe (prénom, nom, e-mail), les informations du garage, les clients et véhicules saisis par le garage (nom, téléphone, e-mail, plaque, kilométrage), les interventions avec leurs commentaires, photos et vidéos, et les SMS envoyés aux clients. Avec le réceptionniste téléphonique : le numéro de l’appelant, ce qu’il a indiqué, le résumé de l’appel et, pour que le garage puisse la réécouter, l’enregistrement et la transcription de la conversation, gardés ${CONSERVATION_ECOUTE_JOURS} jours puis effacés. Pour le bon fonctionnement du service : les jours d’utilisation, la version de l’app, le modèle du téléphone et l’autorisation des notifications.`,
  },
  {
    titre: 'Pourquoi',
    texte:
      'Uniquement pour faire fonctionner l’atelier (planning, suivi des interventions, information des clients) et pour que l’équipe Rencar assure l’assistance. Aucune revente, aucune publicité, aucun pistage.',
  },
  {
    titre: 'Où',
    texte:
      BACKEND === 'demo'
        ? 'En mode démonstration, tout reste sur ce téléphone. Rien n’est envoyé à un serveur.'
        : 'Sur des serveurs situés dans l’Union européenne (Supabase, région Paris). Les notifications passent par Apple et Expo, les e-mails par Resend, les SMS par Octopush, les appels du réceptionniste par Twilio et ElevenLabs : la liste complète et les garanties figurent dans la politique de confidentialité.',
  },
  {
    titre: 'Combien de temps',
    texte:
      BACKEND === 'demo'
        ? 'Tant que l’app est installée. « Réinitialiser la démonstration » depuis le profil efface tout.'
        : 'Votre compte, jusqu’à sa suppression. Les données du garage, tant que le garage utilise Rencar, dans les limites fixées par le garage et précisées dans la politique de confidentialité. Quand le dernier gérant supprime le garage, ses données sont effacées aussitôt, ses photos et ses enregistrements d’appels dans la nuit qui suit.',
  },
  {
    titre: 'Vos droits',
    texte:
      'Accès, rectification, effacement, opposition et portabilité. Vous modifiez vos informations et supprimez votre compte depuis « Mon compte ». Pour les données de ses clients, le garage est responsable du traitement : adressez-vous à lui.',
  },
];

export default function Confidentialite() {
  const insets = useSafeAreaInsets();

  function ecrire() {
    impulsion();
    Linking.openURL(mailtoHref(EMAIL_ASSISTANCE)).catch(() => {});
  }

  function ouvrir(url: string) {
    impulsion();
    void ouvrirPage(url);
  }

  return (
    <Ecran sansHaut defilant>
      <Stack.Screen options={{ title: 'Confidentialité' }} />
      <View className="px-4 pt-4" style={{ paddingBottom: insets.bottom }}>
        <Secondaire className="mb-6">Rencar n’enregistre que ce dont le garage a besoin pour travailler.</Secondaire>

        {BLOCS.map((b) => (
          <Section key={b.titre} titre={b.titre}>
            <Carte className="p-4">
              <Texte>{b.texte}</Texte>
            </Carte>
          </Section>
        ))}

        <Groupe titre="Textes complets">
          <LigneNavigation titre="Politique de confidentialité" onPress={() => ouvrir(URL_CONFIDENTIALITE)} />
          <LigneNavigation titre="Mentions légales" onPress={() => ouvrir(URL_MENTIONS_LEGALES)} derniere />
        </Groupe>

        <Section titre="Contact">
          <Carte className="p-4">
            <Texte>Une question sur vos données ou une demande à faire valoir ?</Texte>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Écrire à ${EMAIL_ASSISTANCE}`}
              onPress={ecrire}
              className="mt-2 min-h-[44px] justify-center self-start active:opacity-60">
              <Texte ton="accent" className="font-semibold">
                {EMAIL_ASSISTANCE}
              </Texte>
            </Pressable>
          </Carte>
          <Legende className="ml-1 mt-2">Cette page résume l’usage des données dans l’app. Elle ne remplace pas les mentions légales du garage.</Legende>
        </Section>
      </View>
    </Ecran>
  );
}
