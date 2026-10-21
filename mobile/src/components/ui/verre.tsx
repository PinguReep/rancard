/**
 * Surface de verre pour ce qui flotte au-dessus du contenu (barre d'action
 * de la fiche) : Liquid Glass sur iOS 26, flou ailleurs, voile simple en
 * secours.
 */

import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/tokens';

let liquide = false;
try {
  liquide = Platform.OS === 'ios' && isLiquidGlassAvailable();
} catch {
  liquide = false;
}

type Props = { children: ReactNode; style?: StyleProp<ViewStyle>; className?: string };

export function Verre({ children, style, className = '' }: Props) {
  const t = useTheme();
  const sombre = t.scheme === 'dark';
  if (liquide) {
    return (
      <GlassView glassEffectStyle="regular" colorScheme={sombre ? 'dark' : 'light'} style={style} className={className}>
        {children}
      </GlassView>
    );
  }
  if (Platform.OS === 'web') {
    return (
      <View
        style={[style, { backgroundColor: sombre ? 'rgba(23, 28, 37, 0.86)' : 'rgba(255, 255, 255, 0.9)', borderWidth: 1, borderColor: t.line }]}
        className={className}>
        {children}
      </View>
    );
  }
  return (
    <BlurView intensity={50} tint={sombre ? 'dark' : 'light'} style={[style, { overflow: 'hidden', borderWidth: 1, borderColor: t.line }]} className={className}>
      {children}
    </BlurView>
  );
}
