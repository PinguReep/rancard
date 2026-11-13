/**
 * Garde-fou : une vue animée (Animated.View, Animated.Text…) ne reçoit qu’un
 * seul style, son style animé.
 *
 * Sur iPhone, un style fixe posé à côté d’un style animé dans un tableau
 * (`style={[fixe, animé]}`) n’est pas appliqué : la bulle « Affichage »
 * sortait en haut de l’écran, les heures de la grille passaient à droite,
 * les feuilles perdaient leur marge basse (vu sur simulateur le 13 novembre
 * 2026). L’aperçu web ne le montre pas : ce test le fait à sa place.
 * Une `className` avec un `style` sur la même vue animée n’est pas encore
 * jugée : à vérifier sur simulateur avant d’en écrire de nouvelles.
 *
 * Ce qui est permis :
 *   <Animated.View style={styleAnime} />            un style animé qui porte tout
 *   <Animated.View entering={…} className="…" />    une className sans style
 *   <View className="…"><Animated.View style={styleAnime} /></View>
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return nom.endsWith('.tsx') ? [chemin] : [];
  });
}

/** Balises ouvrantes `<Animated.Xxx …>` d’un fichier, avec leur ligne. */
function balisesAnimees(texte) {
  const balises = [];
  const motif = /<Animated\.[A-Za-z]+\b/g;
  let m;
  while ((m = motif.exec(texte))) {
    // Fin de la balise ouvrante : le premier « > » hors accolades.
    let profondeur = 0;
    let fin = m.index;
    for (; fin < texte.length; fin++) {
      const c = texte[fin];
      if (c === '{') profondeur++;
      else if (c === '}') profondeur--;
      else if (c === '>' && profondeur === 0) break;
    }
    balises.push({ ligne: texte.slice(0, m.index).split('\n').length, source: texte.slice(m.index, fin + 1) });
  }
  return balises;
}

test('une vue animée ne mêle pas style fixe et style animé', () => {
  const fautes = [];
  for (const f of fichiers(racine)) {
    for (const b of balisesAnimees(readFileSync(f, 'utf8'))) {
      const ou = `${relative(racine, f).replaceAll('\\', '/')}:${b.ligne}`;
      if (/\bstyle=\{\[/.test(b.source)) fautes.push(`${ou} : tableau de styles sur une vue animée`);
    }
  }
  assert.deepEqual(fautes, [], `\n${fautes.join('\n')}\n`);
});
