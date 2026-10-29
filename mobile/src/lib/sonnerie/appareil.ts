/**
 * Identifiant de cette installation de l'app, pour la table `appareils_voix`
 * (0016). Tiré au hasard une fois, gardé dans le trousseau sur iOS
 * (expo-secure-store : il survit à une réinstallation, l'inscription n'est
 * pas dupliquée), dans AsyncStorage sinon. Ce n'est pas un secret.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const CLE = 'rencar.appareil.v1';
const FORME = /^[A-Za-z0-9_-]{8,64}$/;

let memo: string | null = null;

function tirer(): string {
  const hasard = Array.from({ length: 4 }, () => Math.floor(Math.random() * 0x100000000).toString(36)).join('');
  return `a_${Date.now().toString(36)}${hasard}`.slice(0, 48);
}

type Coffre = { lire: (cle: string) => Promise<string | null>; ecrire: (cle: string, v: string) => Promise<void> };

function coffre(): Coffre {
  if (Platform.OS !== 'web') {
    try {
      const S = require('expo-secure-store') as typeof import('expo-secure-store');
      return { lire: (c) => S.getItemAsync(c), ecrire: (c, v) => S.setItemAsync(c, v) };
    } catch {
      // module absent : AsyncStorage
    }
  }
  return { lire: (c) => AsyncStorage.getItem(c), ecrire: (c, v) => AsyncStorage.setItem(c, v) };
}

export async function identifiantAppareil(): Promise<string> {
  if (memo) return memo;
  const c = coffre();
  try {
    const lu = await c.lire(CLE);
    if (lu && FORME.test(lu)) return (memo = lu);
  } catch {
    // lecture impossible : on en tire un nouveau
  }
  const nouveau = tirer();
  try {
    await c.ecrire(CLE, nouveau);
  } catch {
    // non bloquant : l'identifiant vaut pour cette session
  }
  return (memo = nouveau);
}
