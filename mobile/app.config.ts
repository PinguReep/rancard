import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Deux apps tirées du même code, installables côte à côte sur un iPhone
 * (docs/11 § 3), choisies par APP_VARIANT (fixée par chaque profil d’eas.json) :
 *
 * - `production` : « Rencar », App Store, projet Supabase de production.
 *   app.json tel quel. Version 1 sans la sonnerie : ni SDK Twilio Voice (greffon
 *   retiré ici, module natif exclu de l’autoliaison par react-native.config.js),
 *   ni mode d’arrière-plan voip, ni PushKit ; ITSAppUsesNonExemptEncryption à
 *   false (l’app ne chiffre qu’avec le HTTPS d’iOS, docs/11 § 2.13).
 * - `test` : « Rencar Test », TestFlight seulement, préproduction. Identifiant
 *   `<identifiant>.test`, sonnerie VoIP complète (Twilio, CallKit, PushKit),
 *   clé de chiffrement absente : les questions d’export sont posées à chaque build.
 *
 * Sans APP_VARIANT : production. Un build ou une mise à jour lancé sans la
 * variable ne peut donc jamais embarquer Twilio ; au pire, il manque la sonnerie
 * à une app de test, ce que le contrôle de publication refuse. Toute autre
 * valeur arrête la commande.
 *
 * L’app lit `extra.sonnerie` (src/lib/sonnerie/inclusion.ts) : faux, aucune
 * entrée de la sonnerie n’est montrée et le SDK n’est jamais chargé.
 *
 * Copie publique : compte Expo, projet EAS et identifiant de base viennent de
 * l’environnement (EXPO_OWNER, EAS_PROJECT_ID, APP_BUNDLE_ID) quand ils sont
 * définis ; l’identifiant de test en est toujours dérivé.
 */

type Variante = 'test' | 'production';

const TWILIO = '@twilio/voice-react-native-sdk';
const NOM_TEST = 'Rencar Test';
const SUFFIXE_TEST = '.test';
/** Le micro sert aussi aux appels pris dans l’app (règle 5.1.1(ii)). */
const MICRO_TEST =
  'Pour prendre dans l’app les appels des clients que le réceptionniste passe à l’équipe, et pour enregistrer une vidéo du véhicule avec le son.';

function lireVariante(valeur = process.env.APP_VARIANT): Variante {
  const v = (valeur ?? '').trim();
  if (v === '') return 'production';
  if (v === 'test' || v === 'production') return v;
  throw new Error(`APP_VARIANT « ${v} » inconnue : « test » ou « production » attendue (docs/11 § 3).`);
}

type Greffon = string | [string, Record<string, unknown>];
const nomGreffon = (g: unknown) => (Array.isArray(g) ? g[0] : g);

function deriverTest(identifiant: string): string {
  return identifiant.endsWith(SUFFIXE_TEST) ? identifiant : `${identifiant}${SUFFIXE_TEST}`;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variante = lireVariante();
  const test = variante === 'test';
  const owner = process.env.EXPO_OWNER?.trim();
  const projectId = process.env.EAS_PROJECT_ID?.trim();
  const identifiantEnv = process.env.APP_BUNDLE_ID?.trim();

  const baseIos = identifiantEnv || config.ios?.bundleIdentifier;
  const baseAndroid = identifiantEnv || config.android?.package;
  if (!baseIos) throw new Error('app.json : ios.bundleIdentifier absent.');

  // Le greffon Twilio n’est jamais hérité d’app.json : seule la variante test l’ajoute.
  let plugins = ((config.plugins ?? []) as Greffon[]).filter((g) => nomGreffon(g) !== TWILIO);
  const infoPlist: Record<string, unknown> = { ...config.ios?.infoPlist };

  if (test) {
    // expo-audio écrit son texte du micro par-dessus ios.infoPlist : même texte aux deux endroits.
    plugins = plugins.map((g) =>
      Array.isArray(g) && g[0] === 'expo-audio' ? (['expo-audio', { ...g[1], microphonePermission: MICRO_TEST }] as Greffon) : g,
    );
    const apresAudio = plugins.findIndex((g) => nomGreffon(g) === 'expo-audio') + 1;
    plugins.splice(apresAudio > 0 ? apresAudio : plugins.length, 0, [
      TWILIO,
      { apsEnvironment: 'production', microphoneUsageDescription: MICRO_TEST },
    ]);
    infoPlist.CFBundleDisplayName = NOM_TEST;
    infoPlist.NSMicrophoneUsageDescription = MICRO_TEST;
    // Le SDK Twilio chiffre la voix lui-même (SRTP, DTLS) : questions d’export à chaque build.
    delete infoPlist.ITSAppUsesNonExemptEncryption;
  } else {
    infoPlist.ITSAppUsesNonExemptEncryption = false;
  }

  return {
    ...config,
    name: test ? NOM_TEST : (config.name ?? 'Rencar'),
    slug: config.slug ?? 'atelier',
    ...(owner ? { owner } : {}),
    ios: {
      ...config.ios,
      bundleIdentifier: test ? deriverTest(baseIos) : baseIos,
      infoPlist,
    },
    android: {
      ...config.android,
      ...(baseAndroid ? { package: test ? deriverTest(baseAndroid) : baseAndroid } : {}),
    },
    plugins: plugins as ExpoConfig['plugins'],
    ...(projectId ? { updates: { ...config.updates, url: `https://u.expo.dev/${projectId}` } } : {}),
    extra: {
      ...config.extra,
      variante,
      sonnerie: test,
      ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}),
    },
  };
};
