/**
 * « Tirer pour actualiser » sur une liste : recharge tout le garage. Le
 * temps réel suffit d'ordinaire ; ce geste rassure après une coupure.
 */

import { useState } from 'react';
import { RefreshControl } from 'react-native';

import { useSession } from '@/state/session';
import { useTheme } from '@/theme/tokens';

export function useControleRafraichir() {
  const t = useTheme();
  const rafraichir = useSession((s) => s.rafraichir);
  const [enCours, setEnCours] = useState(false);

  async function tirer() {
    setEnCours(true);
    try {
      await rafraichir();
    } catch {
      // Hors ligne : la liste garde ses données, le temps réel reprendra.
    } finally {
      setEnCours(false);
    }
  }

  return <RefreshControl refreshing={enCours} onRefresh={() => void tirer()} tintColor={t.muted} />;
}
