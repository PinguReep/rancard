/**
 * Confidentialité : ce que l'app enregistre, pourquoi, où, combien de
 * temps, et les droits. Court et factuel, sans affirmation juridique.
 */

import { Stack } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Carte, Ecran, Legende, Secondaire, Section, Texte, impulsion } from '@/components/ui';
import { BACKEND } from '@/data';
import { mailtoHref } from '@/lib/format';

const CONTACT = 'support@rencar.example';

type Bloc = { titre: string; texte: string };

const BLOCS: Bloc[] = [
  {
    titre: 'Ce qui est enregistré',
    texte:
      'L’identité des membres de l’équipe (prénom, nom, e-mail), les clients et véhicules saisis par le garage (nom, téléphone, plaque, kilométrage), les interventions avec leurs commentaires, et les photos jointes.',
  },
  {
    titre: 'Pourquoi',
    texte: 'Uniquement pour gérer l’atelier : planning, suivi des interventions, information des clients. Aucune revente, aucune publicité.',
  },
  {
    titre: 'Où',
    texte:
      BACKEND === 'demo'
        ? 'En mode démonstration, tout reste sur ce téléphone. Rien n’est envoyé à un serveur.'
        : 'Sur des serveurs situés dans l’Union européenne (Supabase, région Paris).',
  },
  {
    titre: 'Combien de temps',
    texte:
      BACKEND === 'demo'
        ? 'Tant que l’app est installée. « Réinitialiser la démonstration » depuis le profil efface tout.'
        : 'Tant que le garage utilise Rencar. Un compte supprimé perd immédiatement son accès.',
  },
  {
    titre: 'Vos droits',
    texte:
      'Accès, rectification et suppression. Vous modifiez vos informations et supprimez votre compte depuis « Mon compte ». Pour les données de ses clients, le garage est responsable du traitement : adressez-vous à lui.',
  },
];

export default function Confidentialite() {
  const insets = useSafeAreaInsets();

  function ecrire() {
    impulsion();
    Linking.openURL(mailtoHref(CONTACT)).catch(() => {});
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

        <Section titre="Contact">
          <Carte className="p-4">
            <Texte>Une question sur vos données ou une demande à faire valoir ?</Texte>
            <Pressable accessibilityRole="link" accessibilityLabel={`Écrire à ${CONTACT}`} onPress={ecrire} className="mt-2 min-h-[44px] justify-center self-start active:opacity-60">
              <Texte ton="accent" className="font-semibold">
                {CONTACT}
              </Texte>
            </Pressable>
          </Carte>
          <Legende className="ml-1 mt-2">Cette page résume l’usage des données dans l’app. Elle ne remplace pas les mentions légales du garage.</Legende>
        </Section>
      </View>
    </Ecran>
  );
}
