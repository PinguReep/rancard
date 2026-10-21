/**
 * Enregistrement NativeWind des composants animés de Reanimated : sans cela,
 * un `className` posé sur `Animated.View` est ignoré (surtout sur le web,
 * où la Feuille perdait son fond et son voile). Importé une fois, en tête de
 * app/_layout.tsx.
 */

import { cssInterop } from 'nativewind';
import Animated from 'react-native-reanimated';

cssInterop(Animated.View, { className: 'style' });
cssInterop(Animated.Text, { className: 'style' });
cssInterop(Animated.ScrollView, { className: 'style', contentContainerClassName: 'contentContainerStyle' });
