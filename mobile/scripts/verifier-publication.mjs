/**
 * Contrôle avant un build ou une mise à jour EAS, sans réseau.
 *
 * Usage : node scripts/verifier-publication.mjs <profil> [--mise-a-jour]
 *   <profil>       development, preview (démonstration), preprod ou production
 *                  (profils de eas.json, même nom que le canal).
 *   --mise-a-jour  avant `eas update` : l’`env` de eas.json ne compte pas.
 *
 * Lit l’environnement comme EAS le verra : pour un build, les variables du
 * processus puis l’`env` du profil dans eas.json, qui l’emporte ; pour une
 * mise à jour, les variables du processus seules. À lancer dans le même
 * environnement que la commande qui suit, par exemple :
 *   eas env:exec production "node scripts/verifier-publication.mjs production --mise-a-jour"
 *
 * Variables facultatives, jamais écrites dans le dépôt :
 *   RENCAR_REF_PRODUCTION : référence du projet Supabase de production ; avec
 *     elle, le profil production exige ce projet et le profil preprod le refuse.
 *
 * Vérifie :
 *   - backend : « supabase » pour preprod et production, jamais pour les
 *     builds de démonstration (une mise à jour ne doit pas changer de backend) ;
 *   - Supabase : adresse https://<ref>.supabase.co, clé publique (anon ou
 *     publishable), jamais une clé secrète ; adresse de la page de suivi ;
 *   - app.json : version x.y.z, runtimeVersion par empreinte, textes d’usage
 *     iOS présents et en français soigné, greffons sans doublon et textes du
 *     micro des greffons (expo-audio, Twilio) identiques à ios.infoPlist,
 *     chiffrement jamais à false avec le SDK Twilio Voice, manifeste de
 *     confidentialité sans doublon et avec les données audio ;
 *   - store.config.json : longueurs d’Apple, aucun prix, aucun espace réservé,
 *     aucun identifiant de démonstration, adresses sur rencar.example.
 *
 * Code de sortie 1 au premier défaut bloquant ; la clé n’est jamais affichée.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const profil = process.argv[2];
const miseAJour = process.argv.includes('--mise-a-jour');
const PROFILS_DEMO = ['development', 'preview'];
const PROFILS_SERVEUR = ['preprod', 'production'];

const erreurs = [];
const avertissements = [];
const ko = (m) => erreurs.push(m);
const attention = (m) => avertissements.push(m);

if (![...PROFILS_DEMO, ...PROFILS_SERVEUR].includes(profil)) {
  console.error(`Profil attendu : ${[...PROFILS_DEMO, ...PROFILS_SERVEUR].join(', ')}.`);
  process.exit(1);
}

const lireJson = (nom) => JSON.parse(readFileSync(join(racine, nom), 'utf8'));
const eas = lireJson('eas.json');
const app = lireJson('app.json').expo;
const profilEas = eas.build?.[profil];
if (!profilEas) {
  console.error(`Profil « ${profil} » absent de eas.json.`);
  process.exit(1);
}
// Un build applique l’`env` du profil ; `eas update` ne lit que les variables
// de l’environnement EAS (SDK 55 et plus) : sans EXPO_PUBLIC_BACKEND=supabase
// dans l’environnement EAS production, une mise à jour basculerait les
// téléphones en démonstration.
const env = miseAJour ? { ...process.env } : { ...process.env, ...(profilEas.env ?? {}) };
if (miseAJour) console.log(`Mise à jour : seules les variables de l’environnement comptent (eas.json ignoré).`);

// ─────────────────────────────────────────────────── Typographie française
function typographie(texte, ou) {
  if (/'/.test(texte)) ko(`${ou} : apostrophe droite (’ attendue).`);
  if (/ [:;?!]/.test(texte)) ko(`${ou} : espace ordinaire avant « : ; ? ! » (espace insécable attendue).`);
  if (/\u2014/.test(texte)) ko(`${ou} : tiret cadratin.`);
  if (/«(?!\u00a0)|(?<!\u00a0)»/.test(texte)) ko(`${ou} : guillemets sans espace insécable.`);
}

// ─────────────────────────────────────────────────── Backend et Supabase
const backend = env.EXPO_PUBLIC_BACKEND ?? '';
if (PROFILS_DEMO.includes(profil)) {
  if (backend === 'supabase') ko(`EXPO_PUBLIC_BACKEND=supabase pour « ${profil} » : ces builds sont en démonstration ; publier leur mise à jour avec l’environnement EAS development.`);
} else {
  if (backend !== 'supabase') ko(`EXPO_PUBLIC_BACKEND doit valoir supabase pour « ${profil} » (lu : « ${backend || 'absent'} »).`);
  if (!profilEas.channel) ko(`Profil « ${profil} » sans canal (channel) : aucune mise à jour ne lui parviendrait.`);
  if (profilEas.distribution !== 'store') ko(`Profil « ${profil} » : distribution « store » attendue.`);

  const url = env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const ref = url.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/)?.[1];
  if (!ref) ko('EXPO_PUBLIC_SUPABASE_URL : https://<ref>.supabase.co attendu.');
  const refProduction = env.RENCAR_REF_PRODUCTION;
  if (ref && refProduction) {
    if (profil === 'production' && ref !== refProduction) ko(`Le profil production vise le projet ${ref}, pas la production.`);
    if (profil === 'preprod' && ref === refProduction) ko('Le profil preprod vise la production.');
  } else if (ref && profil === 'production') {
    attention('RENCAR_REF_PRODUCTION absente : le projet visé n’est pas comparé à la production.');
  }

  const cle = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!cle) ko('EXPO_PUBLIC_SUPABASE_ANON_KEY absente.');
  else if (cle.startsWith('sb_secret_')) ko('EXPO_PUBLIC_SUPABASE_ANON_KEY est une clé secrète : seule la clé publique va dans l’app.');
  else if (!cle.startsWith('sb_publishable_')) {
    let charge = null;
    try {
      charge = JSON.parse(Buffer.from(cle.split('.')[1], 'base64url').toString('utf8'));
    } catch {
      ko('EXPO_PUBLIC_SUPABASE_ANON_KEY illisible (ni sb_publishable_, ni jeton anon).');
    }
    if (charge) {
      if (charge.role !== 'anon') ko(`EXPO_PUBLIC_SUPABASE_ANON_KEY a le rôle « ${charge.role} » : seule la clé anon va dans l’app.`);
      if (ref && charge.ref && charge.ref !== ref) ko(`La clé appartient au projet ${charge.ref}, l’adresse au projet ${ref}.`);
    }
  }

  const suivi = env.EXPO_PUBLIC_SUIVI_URL ?? '';
  if (!suivi) ko('EXPO_PUBLIC_SUIVI_URL absente : l’app enverrait aux clients l’adresse par défaut https://suivi.rencar.example/suivi.');
  else if (!/^https:\/\/[^\s?#]+$/.test(suivi)) ko('EXPO_PUBLIC_SUIVI_URL : adresse https sans « ?t= » attendue.');

  if (ref) console.log(`Projet Supabase : ${ref}`);
}

// ─────────────────────────────────────────────────────────────── app.json
if (!/^\d+\.\d+\.\d+$/.test(app.version ?? '')) ko('app.json : version x.y.z attendue.');
if (app.runtimeVersion?.policy !== 'fingerprint') ko('app.json : runtimeVersion.policy doit rester « fingerprint ».');
if (!app.updates?.url && PROFILS_SERVEUR.includes(profil)) attention('app.json : updates.url absente (fournie par app.config.ts dans la copie publique ?).');

const ios = app.ios ?? {};
const plist = ios.infoPlist ?? {};
for (const cle of ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSMicrophoneUsageDescription']) {
  const texte = plist[cle];
  if (!texte) ko(`app.json : ${cle} absent.`);
  else {
    typographie(texte, `app.json ${cle}`);
    if (/\$\(PRODUCT_NAME\)|Allow /.test(texte)) ko(`app.json : ${cle} contient le texte anglais par défaut.`);
  }
}
// Un greffon déclaré deux fois : la plupart (createRunOncePlugin) n’appliquent que la première entrée,
// la seconde est ignorée sans message (c’est ainsi qu’un texte du micro parlant de vidéo l’emportait).
const nomsGreffons = (app.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));
for (const nom of new Set(nomsGreffons.filter((n, i) => nomsGreffons.indexOf(n) !== i))) {
  ko(`app.json : greffon « ${nom} » déclaré deux fois (seule la première entrée s’applique).`);
}
const greffon = (nom) => (app.plugins ?? []).find((p) => Array.isArray(p) && p[0] === nom)?.[1] ?? null;
const picker = greffon('expo-image-picker') ?? {};
if (picker.cameraPermission && picker.cameraPermission !== plist.NSCameraUsageDescription) ko('expo-image-picker : cameraPermission diffère de NSCameraUsageDescription (le greffon l’emporte).');
if (picker.photosPermission && picker.photosPermission !== plist.NSPhotoLibraryUsageDescription) ko('expo-image-picker : photosPermission diffère de NSPhotoLibraryUsageDescription (le greffon l’emporte).');
if (picker.microphonePermission && picker.microphonePermission !== plist.NSMicrophoneUsageDescription) ko('expo-image-picker : microphonePermission diffère de NSMicrophoneUsageDescription (le greffon l’emporte).');
// expo-audio écrit son texte par-dessus ios.infoPlist ; le greffon Twilio seulement si la clé est vide.
const audio = greffon('expo-audio') ?? {};
if (audio.microphonePermission && audio.microphonePermission !== plist.NSMicrophoneUsageDescription) ko('expo-audio : microphonePermission diffère de NSMicrophoneUsageDescription (le greffon l’emporte).');
const twilio = greffon('@twilio/voice-react-native-sdk');
if (twilio?.microphoneUsageDescription && twilio.microphoneUsageDescription !== plist.NSMicrophoneUsageDescription) ko('@twilio/voice-react-native-sdk : microphoneUsageDescription diffère de NSMicrophoneUsageDescription.');
if (twilio && plist.NSMicrophoneUsageDescription && !/appel/i.test(plist.NSMicrophoneUsageDescription)) ko('app.json : NSMicrophoneUsageDescription ne dit pas que le micro sert aux appels (sonnerie dans l’app, règle 5.1.1(ii)).');
// Chiffrement (docs/11 § 2.13) : le SDK Twilio Voice chiffre lui-même la voix (SRTP, DTLS), hors de
// celui d’iOS. « false » n’est donc plus établi : la clé reste absente, et App Store Connect pose les
// questions de conformité à l’export à l’envoi du build. À ne remettre qu’avec une réponse écrite
// d’Apple ou de l’ANSSI, en adaptant ce contrôle.
const chiffrement = plist.ITSAppUsesNonExemptEncryption;
if (chiffrement !== undefined && typeof chiffrement !== 'boolean') ko('app.json : ITSAppUsesNonExemptEncryption doit être un booléen, ou absent.');
if (chiffrement === false && twilio) ko('app.json : ITSAppUsesNonExemptEncryption à false alors que le SDK Twilio Voice chiffre la voix lui-même (docs/11 § 2.13).');
if (chiffrement === undefined) attention('app.json : ITSAppUsesNonExemptEncryption absent ; répondre aux questions de conformité à l’export dans App Store Connect (docs/11 § 2.13).');
if (ios.supportsTablet !== false) attention('app.json : iPad pris en charge, il faudra des captures iPad 13 pouces.');

const manifeste = ios.privacyManifests ?? {};
if (manifeste.NSPrivacyTracking !== false) ko('Manifeste de confidentialité : NSPrivacyTracking doit valoir false.');
const categories = (manifeste.NSPrivacyAccessedAPITypes ?? []).map((t) => t.NSPrivacyAccessedAPIType);
if (new Set(categories).size !== categories.length) ko('Manifeste de confidentialité : catégorie d’API déclarée deux fois.');
for (const c of ['NSPrivacyAccessedAPICategoryUserDefaults', 'NSPrivacyAccessedAPICategoryFileTimestamp', 'NSPrivacyAccessedAPICategoryDiskSpace', 'NSPrivacyAccessedAPICategorySystemBootTime']) {
  if (!categories.includes(c)) ko(`Manifeste de confidentialité : ${c} manquante (utilisée par React Native ou Expo).`);
}
const collectees = (manifeste.NSPrivacyCollectedDataTypes ?? []).map((t) => t.NSPrivacyCollectedDataType);
if (new Set(collectees).size !== collectees.length) ko('Manifeste de confidentialité : type de données collectées déclaré deux fois.');
// Réécoute des appels (0018) : l’enregistrement de chaque appel est lu dans l’app et rattaché au garage.
if (!collectees.includes('NSPrivacyCollectedDataTypeAudioData')) ko('Manifeste de confidentialité : NSPrivacyCollectedDataTypeAudioData manquant (réécoute des appels, docs/11 § 5).');

// ────────────────────────────────────────────────────── store.config.json
const chemin = join(racine, 'store.config.json');
if (!existsSync(chemin)) attention('store.config.json absent : fiche App Store non vérifiée.');
else {
  const fiche = JSON.parse(readFileSync(chemin, 'utf8')).apple ?? {};
  if (fiche.version !== app.version) ko(`store.config.json : version ${fiche.version} au lieu de ${app.version}.`);
  const tout = JSON.stringify(fiche);
  if (/\[à compléter|\[à vérifier|TODO/i.test(tout)) ko('store.config.json : espace réservé à remplir.');
  if (fiche.review?.demoUsername || fiche.review?.demoPassword) ko('store.config.json : identifiants de démonstration dans le dépôt ; les saisir dans App Store Connect.');
  if (fiche.review?.phone || fiche.review?.email) ko('store.config.json : coordonnées personnelles dans le dépôt ; les saisir dans App Store Connect.');
  const limites = { title: [2, 30], subtitle: [0, 30], description: [10, 4000], promoText: [0, 170] };
  for (const [langue, info] of Object.entries(fiche.info ?? {})) {
    for (const [champ, [min, max]] of Object.entries(limites)) {
      const n = (info[champ] ?? '').length;
      if (info[champ] !== undefined && (n < min || n > max)) ko(`store.config.json ${langue}.${champ} : ${n} caractères (${min} à ${max}).`);
    }
    const motsCles = (info.keywords ?? []).join(',');
    if (motsCles.length > 100) ko(`store.config.json ${langue}.keywords : ${motsCles.length} caractères (100 au plus).`);
    for (const champ of ['title', 'subtitle', 'description', 'promoText', 'releaseNotes']) {
      const texte = info[champ];
      if (!texte) continue;
      typographie(texte, `store.config.json ${langue}.${champ}`);
      if (/€|\beuros?\b|\bprix\b|\btarifs?\b|\bgratuit|\babonnement|\bessai gratuit/i.test(texte)) ko(`store.config.json ${langue}.${champ} : prix ou offre commerciale (règle 3.1.3).`);
      if (/\bb[êe]ta\b|\bversion de test\b/i.test(texte)) ko(`store.config.json ${langue}.${champ} : mention de bêta ou de test (règle 2.2).`);
      if (/android|google play/i.test(texte)) ko(`store.config.json ${langue}.${champ} : autre plateforme citée (règle 2.3.10).`);
    }
    for (const champ of ['supportUrl', 'privacyPolicyUrl', 'marketingUrl']) {
      if (info[champ] && !/^https:\/\/rencar\.fr(\/|$)/.test(info[champ])) ko(`store.config.json ${langue}.${champ} : adresse https://rencar.example/… attendue.`);
    }
    if (!info.privacyPolicyUrl) ko(`store.config.json ${langue} : privacyPolicyUrl obligatoire.`);
    if (!info.supportUrl) ko(`store.config.json ${langue} : supportUrl obligatoire.`);
  }
}

// ──────────────────────────────────────────────────────────────── Bilan
for (const a of avertissements) console.log(`Attention : ${a}`);
if (erreurs.length) {
  for (const e of erreurs) console.error(`Bloquant : ${e}`);
  console.error(`\n${erreurs.length} défaut${erreurs.length > 1 ? 's' : ''} : rien ne doit partir avec le profil « ${profil} ».`);
  process.exit(1);
}
console.log(`Profil « ${profil} » prêt (version ${app.version}, canal ${profilEas.channel ?? 'aucun'}).`);
