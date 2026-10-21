const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
// Cache Metro propre à ce dossier (et non le cache partagé de %TEMP%, que
// plusieurs worktrees alimentaient jusqu'à l'erreur EMFILE) : un cache par
// worktree, plus petit, supprimable avec node_modules.
config.cacheVersion = __dirname;
config.cacheStores = [new FileStore({ root: path.join(__dirname, 'node_modules', '.cache', 'metro') })];

module.exports = withNativeWind(config, { input: './src/global.css' });
