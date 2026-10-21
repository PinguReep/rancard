import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Le compte Expo, le projet EAS et l'identifiant de l'app sont propres à chaque
 * déploiement : ils viennent de l'environnement (voir .env.example et les
 * secrets de la CI), jamais du dépôt. Sans eux, l'app tourne quand même en
 * local et en web ; seuls les builds EAS et EAS Update en ont besoin.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const owner = process.env.EXPO_OWNER;
  const projectId = process.env.EAS_PROJECT_ID;
  const identifiant = process.env.APP_BUNDLE_ID;

  return {
    ...config,
    name: config.name ?? 'Rencar',
    slug: config.slug ?? 'atelier',
    ...(owner ? { owner } : {}),
    ios: { ...config.ios, ...(identifiant ? { bundleIdentifier: identifiant } : {}) },
    android: { ...config.android, ...(identifiant ? { package: identifiant } : {}) },
    ...(projectId ? { updates: { ...config.updates, url: `https://u.expo.dev/${projectId}` } } : {}),
    extra: { ...config.extra, ...(projectId ? { eas: { projectId } } : {}) },
  };
};
