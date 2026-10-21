/**
 * Retour haptique discret. Silencieux sur le web et en cas d'erreur.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function impulsion(type: 'leger' | 'moyen' | 'succes' | 'erreur' = 'leger') {
  if (Platform.OS === 'web') return;
  try {
    switch (type) {
      case 'leger':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'moyen':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'succes':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'erreur':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
    }
  } catch {
    // aucun retour haptique disponible
  }
}
