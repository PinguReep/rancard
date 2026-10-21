/**
 * Apparence de l'app : sombre par défaut, clair ou celle du téléphone au
 * choix (Profil). Le choix est gardé sur le téléphone et appliqué par
 * `Appearance.setColorScheme` : NativeWind (`dark:`) et `useColorScheme`
 * suivent sans autre réglage.
 *
 * Sur le web, l'app suit le navigateur (pas d'équivalent à setColorScheme).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { create } from 'zustand';

export type ChoixApparence = 'sombre' | 'clair' | 'systeme';

const CLE = 'rencar.apparence';
const PAR_DEFAUT: ChoixApparence = 'sombre';

function appliquer(choix: ChoixApparence) {
  const fixer = (Appearance as { setColorScheme?: (s: 'light' | 'dark' | null | 'unspecified') => void }).setColorScheme;
  if (typeof fixer !== 'function') return;
  fixer(choix === 'sombre' ? 'dark' : choix === 'clair' ? 'light' : 'unspecified');
}

type Etat = { choix: ChoixApparence; choisir: (c: ChoixApparence) => void };

export const useApparence = create<Etat>((set) => ({
  choix: PAR_DEFAUT,
  choisir(choix) {
    appliquer(choix);
    set({ choix });
    AsyncStorage.setItem(CLE, choix).catch(() => {});
  },
}));

// Appliqué dès le chargement du module (avant le premier écran, sous le
// splash), puis corrigé si l'utilisateur avait choisi autre chose.
appliquer(PAR_DEFAUT);
AsyncStorage.getItem(CLE)
  .then((v) => {
    if (v === 'sombre' || v === 'clair' || v === 'systeme') {
      if (v !== PAR_DEFAUT) appliquer(v);
      useApparence.setState({ choix: v });
    }
  })
  .catch(() => {});
