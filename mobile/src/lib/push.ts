/**
 * Notifications push : permission, jeton Expo, enregistrement côté données.
 *
 * Jamais bloquant, jamais sur le web, toujours dans des try/catch. Rien n'est
 * appelé automatiquement : le geste « Activer les notifications sur ce
 * téléphone » vit dans Profil. Le module configure aussi le comportement en
 * avant-plan (bannière + son) dès qu'il est importé, hors web.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { repo } from '@/data';

/**
 * - accordee     : autorisées par la personne
 * - a_demander   : jamais demandées, on peut afficher la demande système
 * - refusee      : refusées, il faut passer par les réglages du téléphone
 * - indisponible : web, simulateur ou module absent
 */
export type EtatPush = 'accordee' | 'a_demander' | 'refusee' | 'indisponible';

export type ResultatPush = { etat: EtatPush | 'erreur'; jeton: string | null };

type ModuleNotifications = typeof import('expo-notifications');

let moduleNotifications: ModuleNotifications | null | undefined;

/** Charge expo-notifications à la demande, jamais sur le web. */
function notifications(): ModuleNotifications | null {
  if (Platform.OS === 'web') return null;
  if (moduleNotifications !== undefined) return moduleNotifications;
  try {
    moduleNotifications = require('expo-notifications') as ModuleNotifications;
  } catch {
    moduleNotifications = null;
  }
  return moduleNotifications;
}

/** Les jetons push n'existent pas sur simulateur. */
function surAppareilPhysique(): boolean {
  try {
    const Device = require('expo-device') as typeof import('expo-device');
    return Device.isDevice;
  } catch {
    return true;
  }
}

function accordee(N: ModuleNotifications, p: { granted: boolean; ios?: { status: number } | undefined }): boolean {
  return p.granted || p.ios?.status === N.IosAuthorizationStatus.PROVISIONAL;
}

// Comportement quand l'app est ouverte : bannière et son, pas de badge.
(function configurerAvantPlan() {
  const N = notifications();
  if (!N) return;
  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // module natif absent (Expo Go sans module, build incomplet) : silencieux
  }
})();

/** État courant sans rien demander à la personne. */
export async function etatPermissionPush(): Promise<EtatPush> {
  const N = notifications();
  if (!N || !surAppareilPhysique()) return 'indisponible';
  try {
    const p = await N.getPermissionsAsync();
    if (accordee(N, p)) return 'accordee';
    return p.canAskAgain ? 'a_demander' : 'refusee';
  } catch {
    return 'indisponible';
  }
}

/** Affiche la demande système si elle n'a pas encore été posée. */
export async function demanderPermissionPush(): Promise<EtatPush> {
  const N = notifications();
  if (!N || !surAppareilPhysique()) return 'indisponible';
  try {
    const actuel = await N.getPermissionsAsync();
    if (accordee(N, actuel)) return 'accordee';
    if (!actuel.canAskAgain) return 'refusee';
    const p = await N.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    if (accordee(N, p)) return 'accordee';
    return p.canAskAgain ? 'a_demander' : 'refusee';
  } catch {
    return 'indisponible';
  }
}

/** Jeton Expo Push de cet appareil, ou null si impossible (hors ligne, web, simulateur). */
export async function obtenirJetonExpoPush(): Promise<string | null> {
  const N = notifications();
  if (!N || !surAppareilPhysique()) return null;
  try {
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('rencar', {
        name: 'Rencar',
        importance: N.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2f6bff',
      });
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const jeton = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return jeton.data || null;
  } catch {
    return null;
  }
}

/**
 * Demande la permission, récupère le jeton et l'enregistre pour ce membre.
 * Ne lève jamais : le résultat dit ce qui s'est passé.
 */
export async function enregistrerPushSiPossible(membreId: string): Promise<ResultatPush> {
  if (Platform.OS === 'web' || !surAppareilPhysique()) return { etat: 'indisponible', jeton: null };
  const permission = await demanderPermissionPush();
  if (permission !== 'accordee') return { etat: permission, jeton: null };
  const jeton = await obtenirJetonExpoPush();
  if (!jeton) return { etat: 'erreur', jeton: null };
  try {
    await repo().enregistrerJetonPush(membreId, jeton);
  } catch {
    return { etat: 'erreur', jeton };
  }
  return { etat: 'accordee', jeton };
}
