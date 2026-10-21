/**
 * Lien de la page de suivi : à copier ou à envoyer par SMS au client.
 */

import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';

import { Bouton, Carte, Etiquette, Icone, Legende, Mono, impulsion } from '@/components/ui';
import { lienSuivi, smsHref, texteSmsSuivi } from '@/lib/suivi';
import { useTheme } from '@/theme/tokens';

type Props = {
  token: string;
  prenom: string;
  telephone: string;
  garage: string;
  /** Option SMS du garage : masque le bouton d’envoi si désactivée */
  sms: boolean;
};

export function SuiviClient({ token, prenom, telephone, garage, sms }: Props) {
  const t = useTheme();
  const [copie, setCopie] = useState(false);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lien = lienSuivi(token);

  useEffect(
    () => () => {
      if (minuterie.current) clearTimeout(minuterie.current);
    },
    [],
  );

  async function copier() {
    try {
      await Clipboard.setStringAsync(lien);
      impulsion('succes');
      setCopie(true);
      if (minuterie.current) clearTimeout(minuterie.current);
      minuterie.current = setTimeout(() => setCopie(false), 2000);
    } catch {
      // presse-papiers indisponible (navigateur restreint) : rien à faire
    }
  }

  return (
    <Carte className="p-4">
      <Etiquette>Suivi client</Etiquette>
      <Mono className="mt-2" numberOfLines={1} selectable accessibilityLabel={`Lien de suivi ${lien}`}>
        {lien}
      </Mono>
      <View className="mt-3 flex-row flex-wrap gap-2">
        <Bouton
          compact
          variante="secondaire"
          icone={<Icone nom={copie ? 'valider' : 'lien'} taille={16} couleur={copie ? t.ok : t.ink} />}
          onPress={copier}
          accessibilityLabel="Copier le lien de suivi">
          {copie ? 'Lien copié' : 'Copier le lien'}
        </Bouton>
        {sms ? (
          <Bouton
            compact
            variante="secondaire"
            icone={<Icone nom="message" taille={16} />}
            onPress={() => Linking.openURL(smsHref(telephone, texteSmsSuivi({ prenom, garage, token })))}
            accessibilityLabel={`Envoyer le lien de suivi par SMS à ${prenom}`}>
            Envoyer par SMS
          </Bouton>
        ) : null}
      </View>
      <Legende className="mt-3">Le client voit les étapes visibles, pas les notes internes.</Legende>
    </Carte>
  );
}
