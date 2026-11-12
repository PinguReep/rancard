/**
 * Tests de la logique pure de la grille horaire du planning :
 * `src/components/planning/horaire.ts` (axe du temps, chevauchements côte à
 * côte, zoom), module sans dépendance que Node lit directement (types
 * effacés, Node 22.18 et plus).
 *
 * Usage : npm run tester   (ou node --test scripts/horaire.test.mjs)
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ZOOM_MAX,
  ZOOM_MIN,
  bornerZoom,
  bornesJour,
  creneauDuJour,
  defilementApresZoom,
  lignesQuiTiennent,
  minutesDansJour,
  placer,
  repartirLignes,
} from '../src/components/planning/horaire.ts';

const c = (id, debut, fin) => ({ id, debut, fin });
const parId = (places) => Object.fromEntries(places.map((p) => [p.id, p]));

test('créneaux séparés : une colonne chacun, pleine largeur', () => {
  const p = parId(placer([c('a', 480, 540), c('b', 540, 600)]));
  assert.deepEqual([p.a.colonne, p.a.nbColonnes, p.a.etendue], [0, 1, 1]);
  assert.deepEqual([p.b.colonne, p.b.nbColonnes, p.b.etendue], [0, 1, 1]);
});

test('deux créneaux qui se chevauchent : côte à côte', () => {
  const p = parId(placer([c('a', 480, 600), c('b', 510, 570)]));
  assert.equal(p.a.nbColonnes, 2);
  assert.equal(p.a.colonne, 0);
  assert.equal(p.b.colonne, 1);
  assert.equal(p.a.etendue, 1);
});

test('une case s’élargit vers la droite quand la colonne voisine est libre', () => {
  // a 8h-10h, b 8h30-9h, d 9h30-10h30 : b et d partagent la colonne 1, c (9h-9h30) ne recouvre ni b ni d.
  const p = parId(placer([c('a', 480, 600), c('b', 510, 540), c('c', 540, 570), c('d', 570, 630), c('e', 480, 500)]));
  // a et e commencent ensemble : a (le plus long) en colonne 0, e en colonne 1.
  assert.equal(p.a.colonne, 0);
  assert.equal(p.e.colonne, 1);
  assert.equal(p.b.colonne, 1);
  assert.equal(p.a.nbColonnes, 2);
  assert.equal(p.c.colonne, 1);
  assert.equal(p.d.colonne, 1);
});

test('élargissement : trois colonnes, la case de gauche courte prend la place libre', () => {
  // a 8h-12h col 0 ; b 8h-9h col 1 ; x 8h-8h30 col 2 ; y 9h-12h col 1 ; z 8h45-9h col 2.
  const p = parId(placer([c('a', 480, 720), c('b', 480, 540), c('x', 480, 510), c('y', 540, 720), c('z', 525, 540)]));
  assert.equal(p.a.nbColonnes, 3);
  assert.equal(p.y.colonne, 1);
  // y (9h-12h) : colonne 2 libre après 9h, elle s’étend sur deux colonnes.
  assert.equal(p.y.etendue, 2);
  assert.equal(p.b.etendue, 1);
});

test('grappes indépendantes : le matin chargé ne rétrécit pas l’après-midi', () => {
  const p = parId(placer([c('a', 480, 600), c('b', 500, 560), c('pm', 840, 900)]));
  assert.equal(p.a.nbColonnes, 2);
  assert.equal(p.pm.nbColonnes, 1);
});

test('durée visible minimale : deux cases courtes collées passent côte à côte', () => {
  const sans = parId(placer([c('a', 480, 490), c('b', 495, 505)]));
  assert.equal(sans.a.nbColonnes, 1);
  const avec = parId(placer([c('a', 480, 490), c('b', 495, 505)], 30));
  assert.equal(avec.a.nbColonnes, 2);
  // La fin rendue reste la vraie fin.
  assert.equal(avec.a.fin, 490);
});

test('bornes du jour : horaires arrondis à l’heure, jour fermé 8 h à 18 h, débordement', () => {
  assert.deepEqual(bornesJour({ de: '08:30', a: '19:15' }, []), { debut: 480, fin: 1200 });
  assert.deepEqual(bornesJour(null, []), { debut: 480, fin: 1080 });
  assert.deepEqual(bornesJour({ de: '10:00', a: '12:00' }, [c('a', 450, 500), c('b', 700, 790)]), { debut: 420, fin: 840 });
});

test('créneau du jour : même jour civil seulement, borné à minuit', () => {
  const jour = new Date(2026, 10, 12);
  const iso = new Date(2026, 10, 12, 9, 15).toISOString();
  assert.equal(minutesDansJour(iso, jour), 555);
  assert.equal(minutesDansJour(new Date(2026, 10, 13, 9).toISOString(), jour), null);
  const long = creneauDuJour({ id: 'x', debut: new Date(2026, 10, 12, 20).toISOString(), dureeMin: 480 }, jour);
  assert.equal(long.fin, 1440);
});

test('zoom : bornes et point fixe gardé', () => {
  assert.equal(bornerZoom(5), ZOOM_MIN);
  assert.equal(bornerZoom(999), ZOOM_MAX);
  // Point fixe à 200 pt dans la vue, défilement 100 : contenu 300 ; zoom ×2 → 600, défilement 400.
  assert.equal(defilementApresZoom(100, 200, 60, 120), 400);
  assert.equal(defilementApresZoom(0, 10, 120, 60), 0);
});

test('lignes qui tiennent et répartition des champs', () => {
  assert.equal(lignesQuiTiennent(20), 1);
  assert.equal(lignesQuiTiennent(39), 2);
  assert.equal(lignesQuiTiennent(72), 4);
  assert.deepEqual(repartirLignes(['A', 'B', 'C'], 2), ['A', 'B · C']);
  assert.deepEqual(repartirLignes(['A', '', 'C'], 3), ['A', 'C']);
  assert.deepEqual(repartirLignes(['A', 'B'], 1), ['A · B']);
});
