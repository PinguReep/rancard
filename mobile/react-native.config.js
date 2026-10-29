/**
 * Autoliaison des modules natifs React Native, lue par expo-modules-autolinking
 * (`pod install`, Gradle, empreinte d’EAS Update).
 *
 * Le SDK Twilio Voice n’est lié que dans « Rencar Test » (APP_VARIANT=test). Dans
 * « Rencar » (App Store, version 1 : variante production, ou variable absente
 * comme dans app.config.ts), il n’est lié ni sur iOS ni sur Android : le binaire
 * ne contient pas son code natif, qui chiffre la voix lui-même (docs/11 § 2.13).
 * Le JavaScript du SDK reste dans node_modules mais n’est jamais chargé
 * (src/lib/sonnerie/twilio.native.ts, garde `extra.sonnerie`).
 */

const test = (process.env.APP_VARIANT ?? '').trim() === 'test';

module.exports = {
  dependencies: test
    ? {}
    : {
        '@twilio/voice-react-native-sdk': { platforms: { ios: null, android: null } },
      },
};
