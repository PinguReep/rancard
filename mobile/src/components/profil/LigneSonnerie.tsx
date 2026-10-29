/**
 * « Recevoir les appels » : ce téléphone sonne quand le réceptionniste passe
 * un appel à l'équipe (réglage de chaque membre, gardé côté serveur), et
 * « Tester la sonnerie » une fois activé. L'activation demande l'accès au
 * micro : un appel décroché depuis l'écran verrouillé ne pourrait pas le
 * demander. En démonstration, le réglage et l'essai sont simulés.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';

import { Legende, Ligne, Texte, impulsion } from '@/components/ui';
import {
  activerSonnerie,
  desactiverSonnerie,
  MESSAGE_MICRO_REFUSE,
  raisonIndisponible,
  sonnerieSimulee,
  testerSonnerie,
  useTelephone,
} from '@/lib/sonnerie';
import { useTheme } from '@/theme/tokens';

import { LigneInterrupteur } from './LigneInterrupteur';

export function LigneSonnerie({ membreId }: { membreId: string }) {
  const router = useRouter();
  const t = useTheme();
  const inscription = useTelephone((s) => s.inscription);
  const message = useTelephone((s) => s.message);
  const [essai, setEssai] = useState<{ etat: 'envoi' | 'ok' | 'erreur'; texte: string } | null>(null);
  const simule = sonnerieSimulee();

  const active = inscription === 'active';
  const aides: Record<typeof inscription, string> = {
    indisponible: message ?? raisonIndisponible() ?? 'La sonnerie n’est pas disponible pour votre compte.',
    inconnue: 'Lecture du réglage…',
    en_cours: 'Un instant…',
    inactive: message ?? 'Ce téléphone sonnera quand le réceptionniste passe un appel à l’équipe.',
    active: simule
      ? 'Ce téléphone sonne quand le réceptionniste passe un appel à l’équipe. Démonstration : les appels sont simulés.'
      : (message ?? 'Ce téléphone sonne quand le réceptionniste passe un appel à l’équipe, même verrouillé.'),
    erreur: message ?? 'Le réglage n’a pas pu être changé. Réessayez avec du réseau.',
  };

  async function changer(v: boolean) {
    setEssai(null);
    if (v) await activerSonnerie(membreId);
    else await desactiverSonnerie();
    const apres = useTelephone.getState().inscription;
    impulsion(apres === 'active' || apres === 'inactive' ? 'succes' : 'erreur');
  }

  async function tester() {
    if (essai?.etat === 'envoi') return;
    if (simule) {
      // Le bandeau d'appel de la démonstration s'affiche au-dessus de l'app, pas du profil : on le referme.
      if (router.canGoBack()) router.back();
      await testerSonnerie();
      return;
    }
    setEssai({ etat: 'envoi', texte: 'Appel d’essai en cours d’envoi…' });
    try {
      await testerSonnerie();
      impulsion('succes');
      setEssai({ etat: 'ok', texte: 'Ce téléphone va sonner dans quelques secondes.' });
    } catch (e) {
      impulsion('erreur');
      setEssai({ etat: 'erreur', texte: e instanceof Error ? e.message : 'L’essai n’a pas pu partir.' });
    }
  }

  const microRefuse = message === MESSAGE_MICRO_REFUSE;

  return (
    <>
      <LigneInterrupteur
        titre="Recevoir les appels"
        aide={aides[inscription]}
        valeur={active || inscription === 'en_cours'}
        desactive={inscription === 'indisponible' || inscription === 'inconnue' || inscription === 'en_cours'}
        onChange={(v) => void changer(v)}
        derniere={!active && !microRefuse}
      />
      {microRefuse ? (
        <Ligne onPress={() => void Linking.openSettings().catch(() => undefined)} accessibilityLabel="Ouvrir les réglages du téléphone pour le micro" derniere={!active}>
          <Texte className="flex-1">Autoriser le micro</Texte>
          <Texte ton="accent" className="font-semibold">
            Réglages
          </Texte>
        </Ligne>
      ) : null}
      {active ? (
        <Ligne onPress={() => void tester()} accessibilityLabel="Tester la sonnerie sur ce téléphone" derniere>
          <View className="flex-1">
            <Texte>Tester la sonnerie</Texte>
            <Legende className="mt-0.5" ton={essai?.etat === 'erreur' ? 'danger' : 'muted'}>
              {essai?.texte ??
                (simule ? 'Démonstration : un appel d’essai simulé.' : 'Ce téléphone sonne dans quelques secondes, avec un court message.')}
            </Legende>
          </View>
          {essai?.etat === 'envoi' ? <ActivityIndicator color={t.muted} /> : null}
        </Ligne>
      ) : null}
    </>
  );
}
