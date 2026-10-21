/**
 * Plaque d'immatriculation, dessinée comme la vraie : fond blanc, bande
 * bleue « F » à gauche, caractères gras à chasse fixe. C'est ce que le
 * mécanicien reconnaît en premier, avant le nom du client.
 */

import { Text, View } from 'react-native';

type Props = { plaque: string; grande?: boolean };

export function Plaque({ plaque, grande }: Props) {
  const h = grande ? 34 : 26;
  return (
    <View
      accessibilityLabel={`Plaque ${plaque.split('').join(' ')}`}
      className="flex-row self-start overflow-hidden rounded-[5px] border-[1.5px] border-[#0b0d12] bg-[#f4f5f7]"
      style={{ height: h }}>
      <View className="items-center justify-end bg-[#1b43c4] pb-[2px]" style={{ width: grande ? 19 : 15 }}>
        <Text className="font-bold text-white" style={{ fontSize: grande ? 10 : 8.5 }} maxFontSizeMultiplier={1}>
          F
        </Text>
      </View>
      <View className="justify-center" style={{ paddingHorizontal: grande ? 10 : 7 }}>
        <Text
          maxFontSizeMultiplier={1.2}
          numberOfLines={1}
          className="font-mono font-bold text-[#0b0d12]"
          style={{ fontSize: grande ? 19 : 14.5, letterSpacing: 0.5 }}>
          {plaque}
        </Text>
      </View>
    </View>
  );
}
