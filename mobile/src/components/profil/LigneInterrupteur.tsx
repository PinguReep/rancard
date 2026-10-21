/**
 * Ligne de Groupe avec interrupteur natif. Le changement est immédiat :
 * l'appelant enregistre, le retour haptique est donné ici.
 */

import { Switch, View } from 'react-native';

import { Legende, Ligne, Texte, impulsion } from '@/components/ui';
import { useTheme } from '@/theme/tokens';

type Props = {
  titre: string;
  aide?: string;
  valeur: boolean;
  onChange: (valeur: boolean) => void;
  desactive?: boolean;
  derniere?: boolean;
};

export function LigneInterrupteur({ titre, aide, valeur, onChange, desactive, derniere }: Props) {
  const t = useTheme();
  return (
    <Ligne derniere={derniere}>
      <View className={`flex-1 ${desactive ? 'opacity-50' : ''}`}>
        <Texte>{titre}</Texte>
        {aide ? <Legende className="mt-0.5">{aide}</Legende> : null}
      </View>
      <Switch
        accessibilityLabel={titre}
        value={valeur}
        disabled={desactive}
        onValueChange={(v) => {
          impulsion();
          onChange(v);
        }}
        trackColor={{ true: t.accentFond, false: t.line }}
        thumbColor={t.blanc}
        {...({ activeThumbColor: t.blanc } as object)}
        ios_backgroundColor={t.line}
      />
    </Ligne>
  );
}
