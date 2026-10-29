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
 * environnement que la commande qui suit, après `npm ci`, par exemple :
 *   eas env:exec production "node scripts/verifier-publication.mjs production --mise-a-jour"
 *
 * Variables facultatives, jamais écrites dans le dépôt :
 *   RENCAR_REF_PRODUCTION : référence du projet Supabase de production ; avec
 *     elle, le profil production exige ce projet, et « Rencar Test » (preprod)
 *     le refuse.
 *
 * Deux apps (docs/11 § 3), choisies par APP_VARIANT (app.config.ts) :
 *   - production (« Rencar », App Store) : profil production ;
 *   - test (« Rencar Test », TestFlight) : profils preprod, development, preview.
 * La configuration est lue telle qu’EAS la calculera (`expo config --type
 * introspect`, `expo-modules-autolinking react-native-config`, avec ce même
 * environnement), pas seulement app.json.
 *
 * Vérifie :
 *   - variante : APP_VARIANT fixée par le profil d’eas.json et conforme au
 *     profil ; pour une mise à jour, présente dans l’environnement (sinon
 *     l’empreinte serait celle de l’autre app : la mise à jour ne parviendrait
 *     à personne) ;
 *   - Rencar (production) : ni greffon ni module natif Twilio (iOS et Android),
 *     pas de mode d’arrière-plan voip, ITSAppUsesNonExemptEncryption à false,
 *     `extra.sonnerie` faux, texte du micro sans les appels, identifiant et nom
 *     qui ne sont pas ceux de l’app de test ;
 *   - Rencar Test : identifiant `….test`, nom de test, greffon et module natif
 *     Twilio, mode voip, clé de chiffrement absente, `extra.sonnerie` vrai,
 *     jamais branchée sur le projet de production ;
 *   - backend : « supabase » pour preprod et production, jamais pour les
 *     builds de démonstration (une mise à jour ne doit pas changer de backend) ;
 *   - Supabase : adresse https://<ref>.supabase.co, clé publique (anon ou
 *     publishable), jamais une clé secrète ; adresse de la page de suivi ;
 *   - Turnstile (vérification anti-robot de « Créer un compte ») : clé de
 *     site exigée en production (avertissement en preprod, où le serveur
 *     accepte l’inscription sans jeton tant que TURNSTILE_SECRET n’est pas
 *     posé), jamais une clé secrète ni une clé de test de Cloudflare ;
 *     adresse du widget (`ORIGINE_WIDGET`) sur un vrai domaine, jamais un
 *     domaine réservé (.example, .test…) qu’une réécriture de l’export y
 *     aurait mis ;
 *   - configuration : version x.y.z, runtimeVersion par empreinte, textes
 *     d’usage iOS présents et en français soigné, greffons sans doublon et
 *     textes du micro des greffons (expo-audio, Twilio) identiques à
 *     l’Info.plist, manifeste de confidentialité sans doublon et avec les
 *     données audio ;
 *   - store.config.json : longueurs d’Apple, aucun prix, aucun espace réservé,
 *     aucun identifiant de démonstration, adresses sur rencar.fr, aucune
 *     mention de la sonnerie dans l’app (absente du binaire de la version 1).
 *
 * Code de sortie 1 au premier défaut bloquant ; la clé n’est jamais affichée.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const profil = process.argv[2];
const miseAJour = process.argv.includes('--mise-a-jour');
const PROFILS_DEMO = ['development', 'preview'];
const PROFILS_SERVEUR = ['preprod', 'production'];
/** App de chaque profil (APP_VARIANT) : seule la production part sur l’App Store. */
const VARIANTE_DU_PROFIL = { development: 'test', preview: 'test', preprod: 'test', production: 'production' };
const NOM_APP = { test: 'Rencar Test', production: 'Rencar' };
const TWILIO = '@twilio/voice-react-native-sdk';
const FICHIER_VERIFICATION = 'src/components/auth/verification.ts';

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

// ─────────────────────────────────────────────────────────────── Variante
// Même règle qu’app.config.ts : sans APP_VARIANT, production (jamais Twilio).
const attendue = VARIANTE_DU_PROFIL[profil];
const varianteLue = (env.APP_VARIANT ?? '').trim();
const variante = varianteLue || 'production';
if (!['test', 'production'].includes(variante)) {
  console.error(`Bloquant : APP_VARIANT « ${varianteLue} » inconnue (test ou production).`);
  process.exit(1);
}
if (profilEas.env?.APP_VARIANT !== attendue) {
  ko(`eas.json : le profil « ${profil} » doit fixer APP_VARIANT=${attendue} dans son env (app « ${NOM_APP[attendue]} »).`);
}
if (variante !== attendue) {
  const lu = varianteLue ? `APP_VARIANT=${varianteLue}` : 'APP_VARIANT absente (donc production)';
  ko(
    miseAJour
      ? `${lu} dans l’environnement : la mise à jour aurait l’empreinte de « ${NOM_APP[variante]} » et ne parviendrait à aucun téléphone de « ${NOM_APP[attendue]} » (canal ${profilEas.channel ?? profil}). Définir APP_VARIANT=${attendue} dans l’environnement EAS (docs/11 § 3).`
      : `${lu} pour le profil « ${profil} » : « ${NOM_APP[attendue]} » attendue (APP_VARIANT=${attendue}).`,
  );
} else if (miseAJour && !varianteLue) {
  attention('APP_VARIANT absente de l’environnement : production par défaut ; la définir dans l’environnement EAS production (docs/11 § 3).');
}
console.log(`App : ${NOM_APP[variante]} (APP_VARIANT=${varianteLue || 'absente, donc production'}).`);

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
    // Rencar Test (TestFlight) n’est jamais branchée sur la production, quel que soit son profil.
    if ((profil === 'preprod' || variante === 'test') && ref === refProduction) ko(`Rencar Test (profil ${profil}) vise la production : la préproduction est attendue.`);
  } else if (ref) {
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
  if (!suivi) ko('EXPO_PUBLIC_SUIVI_URL absente : l’app enverrait aux clients l’adresse par défaut https://suivi.rencar.fr/suivi.');
  else if (!/^https:\/\/[^\s?#]+$/.test(suivi)) ko('EXPO_PUBLIC_SUIVI_URL : adresse https sans « ?t= » attendue.');

  // Clé de site Turnstile (docs/11 § 8.5). Sans elle, l’app n’a pas de widget et n’envoie aucun jeton :
  // l’inscription passe tant que TURNSTILE_SECRET manque au projet, puis est refusée (« Mettez à jour
  // l’app »). Clés de test publiées par Cloudflare : 1x…, 2x…, 3x… suivis de zéros (24 caractères pour
  // une clé de site, 35 pour une clé secrète) ; jamais dans un build en ligne : avec la vraie clé
  // secrète, leur jeton est refusé, et une clé secrète de test est refusée par la fonction en ligne.
  const cleSite = (env.EXPO_PUBLIC_TURNSTILE_SITEKEY ?? '').trim();
  const cleDeTest = /^[123]x0+[0-9A-F]{2}$/i.test(cleSite);
  if (!cleSite && profil === 'production') ko('EXPO_PUBLIC_TURNSTILE_SITEKEY absente : la production exige la vérification anti-robot de « Créer un compte » (docs/11 § 8.5).');
  else if (!cleSite) attention('EXPO_PUBLIC_TURNSTILE_SITEKEY absente : ce build n’aura pas de vérification anti-robot ; son inscription sera refusée dès que TURNSTILE_SECRET sera posé sur le projet (docs/11 § 8.5).');
  else if (cleSite.length > 30) ko('EXPO_PUBLIC_TURNSTILE_SITEKEY a la longueur d’une clé secrète : seule la clé de site va dans l’app.');
  else if (cleDeTest) ko('EXPO_PUBLIC_TURNSTILE_SITEKEY est une clé de test de Cloudflare : la vraie clé de site du widget Rencar est attendue (docs/11 § 8.5).');
  else if (!/^0x[0-9A-Za-z_-]+$/.test(cleSite)) attention('EXPO_PUBLIC_TURNSTILE_SITEKEY n’a pas la forme habituelle (0x…) : vérifier la clé de site du widget.');

  // Adresse sous laquelle l’app sert le widget : Cloudflare refuse tout domaine absent du widget.
  if (cleSite) {
    const source = existsSync(join(racine, FICHIER_VERIFICATION)) ? readFileSync(join(racine, FICHIER_VERIFICATION), 'utf8') : '';
    const origine = source.match(/ORIGINE_WIDGET\s*=\s*'([^']*)'/)?.[1] ?? '';
    let hote = '';
    try {
      hote = new URL(origine).protocol === 'https:' ? new URL(origine).hostname : '';
    } catch {
      hote = '';
    }
    if (!hote) ko(`${FICHIER_VERIFICATION} : ORIGINE_WIDGET illisible (https://<domaine du widget>/ attendu).`);
    else if (/(^|\.)(example|test|invalid|localhost)$/.test(hote)) {
      ko(`ORIGINE_WIDGET sert le widget sous « ${hote} », un domaine réservé : Cloudflare refuserait chaque vérification (export réécrit ? docs/11 § 6).`);
    }
  }

  if (ref) console.log(`Projet Supabase : ${ref}`);
}

// ────────────────────────────────────── Configuration calculée (app.config.ts)
// Commandes locales de node_modules, sans réseau, avec l’environnement qu’EAS verra.
function commande(script, args, quoi) {
  const chemin = join(racine, 'node_modules', ...script);
  if (!existsSync(chemin)) {
    console.error(`Bloquant : ${script.join('/')} introuvable : lancer « npm ci » dans mobile/ avant le contrôle.`);
    process.exit(1);
  }
  const r = spawnSync(process.execPath, [chemin, ...args], {
    cwd: racine,
    env: { ...env, EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', CI: '1' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    if (r.status !== 0) throw new Error();
    return JSON.parse(r.stdout);
  } catch {
    const raison = (r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' ');
    console.error(`Bloquant : ${quoi} illisible (code ${r.status}) : ${raison}`);
    process.exit(1);
  }
}

const app = commande(['expo', 'bin', 'cli'], ['config', '--type', 'introspect', '--json'], 'expo config --type introspect');
const liens = Object.fromEntries(
  ['ios', 'android'].map((p) => [
    p,
    Object.keys(
      commande(['expo-modules-autolinking', 'bin', 'expo-modules-autolinking.js'], ['react-native-config', '--platform', p, '--json'], `autoliaison ${p}`)
        .dependencies ?? {},
    ),
  ]),
);

if (!/^\d+\.\d+\.\d+$/.test(app.version ?? '')) ko('app.json : version x.y.z attendue.');
if (app.runtimeVersion?.policy !== 'fingerprint') ko('app.json : runtimeVersion.policy doit rester « fingerprint ».');
if (!app.updates?.url && PROFILS_SERVEUR.includes(profil)) attention('Configuration : updates.url absente (EAS_PROJECT_ID absent dans la copie publique ?).');

const ios = app.ios ?? {};
const plist = ios.infoPlist ?? {};
for (const cle of ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSMicrophoneUsageDescription']) {
  const texte = plist[cle];
  if (!texte) ko(`Info.plist : ${cle} absent.`);
  else {
    typographie(texte, `Info.plist ${cle}`);
    if (/\$\(PRODUCT_NAME\)|Allow /.test(texte)) ko(`Info.plist : ${cle} contient le texte anglais par défaut.`);
  }
}
// Un greffon déclaré deux fois : la plupart (createRunOncePlugin) n’appliquent que la première entrée,
// la seconde est ignorée sans message (c’est ainsi qu’un texte du micro parlant de vidéo l’emportait).
const nomsGreffons = (app.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));
for (const nom of new Set(nomsGreffons.filter((n, i) => nomsGreffons.indexOf(n) !== i))) {
  ko(`Configuration : greffon « ${nom} » déclaré deux fois (seule la première entrée s’applique).`);
}
const greffon = (nom) => (app.plugins ?? []).find((p) => Array.isArray(p) && p[0] === nom)?.[1] ?? null;
const picker = greffon('expo-image-picker') ?? {};
if (picker.cameraPermission && picker.cameraPermission !== plist.NSCameraUsageDescription) ko('expo-image-picker : cameraPermission diffère de NSCameraUsageDescription (le greffon l’emporte).');
if (picker.photosPermission && picker.photosPermission !== plist.NSPhotoLibraryUsageDescription) ko('expo-image-picker : photosPermission diffère de NSPhotoLibraryUsageDescription (le greffon l’emporte).');
if (picker.microphonePermission && picker.microphonePermission !== plist.NSMicrophoneUsageDescription) ko('expo-image-picker : microphonePermission diffère de NSMicrophoneUsageDescription (le greffon l’emporte).');
// expo-audio écrit son texte par-dessus ios.infoPlist ; le greffon Twilio seulement si la clé est vide.
const audio = greffon('expo-audio') ?? {};
if (audio.microphonePermission && audio.microphonePermission !== plist.NSMicrophoneUsageDescription) ko('expo-audio : microphonePermission diffère de NSMicrophoneUsageDescription (le greffon l’emporte).');
const twilio = greffon(TWILIO);
if (twilio?.microphoneUsageDescription && twilio.microphoneUsageDescription !== plist.NSMicrophoneUsageDescription) ko(`${TWILIO} : microphoneUsageDescription diffère de NSMicrophoneUsageDescription.`);

// Chiffrement (docs/11 § 2.13) : le SDK Twilio Voice chiffre lui-même la voix (SRTP, DTLS), hors de
// celui d’iOS. Rencar (App Store, version 1) n’a pas le SDK : seulement le HTTPS d’iOS, donc false.
// Rencar Test l’a : clé absente, App Store Connect pose les questions d’export à chaque build.
const chiffrement = plist.ITSAppUsesNonExemptEncryption;
const modes = plist.UIBackgroundModes ?? [];
const identifiant = ios.bundleIdentifier ?? '';
const nomAffiche = `${app.name ?? ''} ${plist.CFBundleDisplayName ?? ''}`;
const avecTwilio = nomsGreffons.includes(TWILIO);
const lieIos = liens.ios.includes(TWILIO);
const lieAndroid = liens.android.includes(TWILIO);

if (variante === 'production') {
  if (avecTwilio) ko(`Rencar (App Store) : greffon ${TWILIO} présent ; la version 1 part sans la sonnerie (docs/11 § 2.13).`);
  if (lieIos) ko(`Rencar (App Store) : module natif ${TWILIO} lié sur iOS (react-native.config.js).`);
  if (lieAndroid) ko(`Rencar (App Store) : module natif ${TWILIO} lié sur Android (react-native.config.js).`);
  if (modes.includes('voip')) ko('Rencar (App Store) : mode d’arrière-plan voip déclaré sans sonnerie dans l’app (règle 2.5.4).');
  if (chiffrement !== false) ko(`Rencar (App Store) : ITSAppUsesNonExemptEncryption doit valoir false (lu : ${chiffrement === undefined ? 'absente' : chiffrement}) ; l’app ne chiffre qu’avec le HTTPS d’iOS (docs/11 § 2.13).`);
  if (app.extra?.sonnerie !== false) ko('Rencar (App Store) : extra.sonnerie doit valoir false (l’app chargerait le SDK absent du binaire).');
  if (/appel/i.test(plist.NSMicrophoneUsageDescription ?? '')) ko('Rencar (App Store) : le texte du micro parle des appels, que cette app ne prend pas (règle 5.1.1(ii)).');
  if (/\.test$/i.test(identifiant)) ko(`Rencar (App Store) : identifiant de l’app de test (${identifiant}).`);
  if (/\btest\b/i.test(nomAffiche)) ko(`Rencar (App Store) : nom de l’app de test (${nomAffiche.trim()}).`);
} else {
  if (!/\.test$/.test(identifiant)) ko(`Rencar Test : identifiant ${identifiant || 'absent'} ; <identifiant de Rencar>.test attendu (app.config.ts perdu à l’export ?).`);
  if (!/\btest\b/i.test(plist.CFBundleDisplayName ?? '')) ko('Rencar Test : CFBundleDisplayName sans « Test » : les deux apps auraient le même nom sur l’écran d’accueil.');
  if (!avecTwilio) ko(`Rencar Test : greffon ${TWILIO} absent ; la sonnerie ne serait pas dans le binaire (app.config.ts perdu à l’export ?).`);
  if (!lieIos) ko(`Rencar Test : module natif ${TWILIO} non lié sur iOS (react-native.config.js).`);
  if (!modes.includes('voip')) ko('Rencar Test : mode d’arrière-plan voip absent ; aucun appel ne sonnerait app fermée.');
  if (chiffrement !== undefined) ko(`Rencar Test : ITSAppUsesNonExemptEncryption doit être absente (lu : ${chiffrement}) ; le SDK Twilio chiffre la voix lui-même, répondre aux questions d’export (docs/11 § 2.13).`);
  if (app.extra?.sonnerie !== true) ko('Rencar Test : extra.sonnerie doit valoir true.');
  if (plist.NSMicrophoneUsageDescription && !/appel/i.test(plist.NSMicrophoneUsageDescription)) ko('Rencar Test : NSMicrophoneUsageDescription ne dit pas que le micro sert aux appels (sonnerie dans l’app, règle 5.1.1(ii)).');
}
if (ios.supportsTablet !== false) attention('Configuration : iPad pris en charge, il faudra des captures iPad 13 pouces.');

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
// Fiche de « Rencar » (App Store), contrôlée quel que soit le profil. À retirer avec la version 1.1.
const SONNERIE_FR = /\bsonn(erie|e|ent|era)\b|\bVoIP\b|CallKit|PushKit|Recevoir les appels|appels? reçus? dans l’app/i;
const SONNERIE_EN = /\bVoIP\b|CallKit|PushKit|Twilio Voice|Recevoir les appels|Tester la sonnerie|\brings?\b|\bringing\b|voip background|locked iPhone/i;
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
      if (info[champ] && !/^https:\/\/rencar\.fr(\/|$)/.test(info[champ])) ko(`store.config.json ${langue}.${champ} : adresse https://rencar.fr/… attendue.`);
    }
    if (!info.privacyPolicyUrl) ko(`store.config.json ${langue} : privacyPolicyUrl obligatoire.`);
    if (!info.supportUrl) ko(`store.config.json ${langue} : supportUrl obligatoire.`);
    // Version 1 : le binaire de l’App Store n’a pas la sonnerie (règle 2.3, métadonnées exactes).
    for (const champ of ['title', 'subtitle', 'description', 'promoText', 'releaseNotes']) {
      if (SONNERIE_FR.test(info[champ] ?? '')) ko(`store.config.json ${langue}.${champ} : parle de la sonnerie dans l’app, absente de Rencar version 1 (docs/11 § 4).`);
    }
  }
  if (SONNERIE_EN.test(fiche.review?.notes ?? '')) ko('store.config.json review.notes : parle de la sonnerie dans l’app (VoIP, CallKit, PushKit, appels reçus), absente de Rencar version 1 (docs/11 § 4).');
}

// ──────────────────────────────────────────────────────────────── Bilan
for (const a of avertissements) console.log(`Attention : ${a}`);
if (erreurs.length) {
  for (const e of erreurs) console.error(`Bloquant : ${e}`);
  console.error(`\n${erreurs.length} défaut${erreurs.length > 1 ? 's' : ''} : rien ne doit partir avec le profil « ${profil} ».`);
  process.exit(1);
}
console.log(
  `Profil « ${profil} » prêt : ${NOM_APP[variante]} (${identifiant}), version ${app.version}, canal ${profilEas.channel ?? 'aucun'}, Twilio ${lieIos ? 'lié' : 'absent'}.`,
);
