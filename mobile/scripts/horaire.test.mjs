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
  H_MAX,
  H_MIN,
  ancrer,
  bornerNiveau,
  bornesJour,
  bornesJours,
  bornesLargeur,
  creneauDuJour,
  hauteurDuNiveau,
  joursConsecutifs,
  largeurDuNiveau,
  lignesQuiTiennent,
  lundiDe,
  minutesDansJour,
  niveauApresEchelle,
  niveauDeLargeur,
  niveauParDefaut,
  placer,
  repartirLignes,
  zonesFermees,
} from '../src/components/planning/horaire.ts';

const proche = (a, b, ecart = 1e-9) => assert.ok(Math.abs(a - b) <= ecart, `${a} ≉ ${b}`);

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

test('niveau : borné entre 0 et 1, valeurs par défaut', () => {
  assert.equal(bornerNiveau(-0.2), 0);
  assert.equal(bornerNiveau(1.7), 1);
  assert.equal(bornerNiveau(0.3), 0.3);
  assert.equal(bornerNiveau(Number.NaN), 0);
  assert.equal(niveauParDefaut('journee', false), 1);
  assert.equal(niveauParDefaut('journee', true), 0);
  assert.equal(niveauParDefaut('equipe', false), 0.4);
  assert.equal(niveauParDefaut('equipe', true), 0);
});

test('bornes de largeur : un jour remplit l’écran, la semaine tient ; « Équipe » jamais sous 64 pt', () => {
  assert.deepEqual(bornesLargeur(329, 7), { min: 47, max: 329 });
  // Trois mécaniciens : toutes les colonnes tiennent au minimum.
  assert.deepEqual(bornesLargeur(330, 3, 64), { min: 110, max: 330 });
  // Huit colonnes : 64 pt au moins, on défile.
  assert.deepEqual(bornesLargeur(330, 8, 64), { min: 64, max: 330 });
  // Une colonne seule : pas de plage ; écran minuscule : jamais plus large que l’écran.
  assert.deepEqual(bornesLargeur(330, 1, 64), { min: 330, max: 330 });
  assert.deepEqual(bornesLargeur(50, 3, 64), { min: 50, max: 50 });
  assert.deepEqual(bornesLargeur(0, 7), { min: 0, max: 0 });
});

test('largeur et hauteur suivent le même niveau', () => {
  const min = 47;
  const max = 329;
  assert.equal(largeurDuNiveau(0, min, max), min);
  proche(largeurDuNiveau(1, min, max), max);
  // À mi-course : moyenne géométrique.
  proche(largeurDuNiveau(0.5, min, max), Math.sqrt(min * max));
  assert.equal(largeurDuNiveau(2, min, max), largeurDuNiveau(1, min, max));
  // Sans plage : la largeur disponible, quel que soit le niveau.
  assert.equal(largeurDuNiveau(0.3, 330, 330), 330);
  assert.equal(largeurDuNiveau(0.3, 0, 0), 0);
  assert.equal(hauteurDuNiveau(0), H_MIN);
  proche(hauteurDuNiveau(1), H_MAX);
  proche(hauteurDuNiveau(0.5), Math.sqrt(H_MIN * H_MAX));
  assert.equal(hauteurDuNiveau(-1), H_MIN);
});

test('niveau déduit de la largeur : aller-retour exact, borné, null sans plage', () => {
  const min = 47;
  const max = 329;
  for (const t of [0, 0.25, 0.4, 0.5, 0.9, 1]) proche(niveauDeLargeur(largeurDuNiveau(t, min, max), min, max), t);
  assert.equal(niveauDeLargeur(10, min, max), 0);
  assert.equal(niveauDeLargeur(1000, min, max), 1);
  assert.equal(niveauDeLargeur(330, 330, 330), null);
  assert.equal(niveauDeLargeur(100, 0, 0), null);
});

test('pincement : la largeur suit l’échelle, bornée, le niveau s’en déduit', () => {
  const min = 47;
  const max = 329;
  // Un jour plein écran (niveau 1) pincé de moitié : la largeur est divisée par deux.
  const t = niveauApresEchelle(1, 0.5, min, max);
  proche(largeurDuNiveau(t, min, max), max / 2, 1e-6);
  // Au-delà des bornes : la semaine entière, un jour plein écran.
  assert.equal(niveauApresEchelle(0.5, 0.01, min, max), 0);
  assert.equal(niveauApresEchelle(0.5, 100, min, max), 1);
  // Échelle 1 : rien ne bouge ; échelle illisible : niveau de départ.
  proche(niveauApresEchelle(0.4, 1, min, max), 0.4);
  assert.equal(niveauApresEchelle(0.4, 0, min, max), 0.4);
  // Une colonne seule (pas de plage de largeur) : l’échelle règle les heures seules.
  const seul = niveauApresEchelle(0, 2, 330, 330);
  proche(hauteurDuNiveau(seul), 2 * H_MIN, 1e-6);
});

test('ancrage : le point sous les doigts reste sous les doigts, sur les deux axes', () => {
  // Horizontal : doigts à 200 pt, défilement 100 → point 300 du contenu ; largeur ×2 → 600, défilement 400.
  assert.equal(ancrer(100, 200, 200, 60, 120), 400);
  // Zoom arrière près du bord : jamais de défilement négatif.
  assert.equal(ancrer(0, 10, 10, 120, 60), 0);
  // Les doigts glissent de 30 pt vers la gauche : le contenu suit, 30 pt plus loin.
  assert.equal(ancrer(100, 200, 170, 60, 120), 430);
  // Borné au défilement maximal du contenu.
  assert.equal(ancrer(100, 200, 200, 60, 120, 0, 350), 350);
  assert.equal(ancrer(100, 200, 200, 60, 120, 0, -5), 0);
  // Vertical avec la marge fixe de 10 pt en tête : l’heure sous les doigts ne bouge pas.
  const h1 = 36;
  const h2 = 96;
  const y1 = 50;
  const doigt = 180;
  const minutes = ((y1 + doigt - 10) / h1) * 60;
  const y2 = ancrer(y1, doigt, doigt, h1, h2, 10);
  proche(10 + (minutes / 60) * h2 - y2, doigt);
  // Même échelle : seul le glissement des doigts compte.
  assert.equal(ancrer(80, 100, 140, 50, 50, 10), 40);
});

test('lignes qui tiennent et répartition des champs', () => {
  assert.equal(lignesQuiTiennent(20), 1);
  assert.equal(lignesQuiTiennent(39), 2);
  assert.equal(lignesQuiTiennent(72), 4);
  assert.deepEqual(repartirLignes(['A', 'B', 'C'], 2), ['A', 'B · C']);
  assert.deepEqual(repartirLignes(['A', '', 'C'], 3), ['A', 'C']);
  assert.deepEqual(repartirLignes(['A', 'B'], 1), ['A · B']);
});

test('axe des heures sur plusieurs jours : union des ouvertures, jours fermés ignorés', () => {
  const semaine = [{ de: '08:30', a: '18:00' }, { de: '08:00', a: '19:00' }, { de: '09:00', a: '12:00' }, null];
  assert.deepEqual(bornesJours(semaine, []), { debut: 480, fin: 1140 });
  // Tous fermés : 8 h à 18 h.
  assert.deepEqual(bornesJours([null, null], []), { debut: 480, fin: 1080 });
  // Un créneau un jour fermé élargit l’axe.
  assert.deepEqual(bornesJours([{ de: '09:00', a: '12:00' }, null], [c('a', 1080, 1150)]), { debut: 540, fin: 1200 });
  // Un jour : même résultat qu’avant.
  assert.deepEqual(bornesJour({ de: '08:30', a: '19:15' }, []), bornesJours([{ de: '08:30', a: '19:15' }], []));
});

test('heures fermées d’un jour sur l’axe commun', () => {
  assert.deepEqual(zonesFermees({ de: '09:00', a: '12:00' }, 480, 1140), [
    { debut: 480, fin: 540 },
    { debut: 720, fin: 1140 },
  ]);
  assert.deepEqual(zonesFermees({ de: '08:00', a: '19:00' }, 480, 1140), []);
  assert.deepEqual(zonesFermees(null, 480, 1140), [{ debut: 480, fin: 1140 }]);
});

test('lundi de la semaine : première colonne de « Journée »', () => {
  assert.equal(lundiDe(new Date(2026, 10, 12, 15, 30)).getTime(), new Date(2026, 10, 9).getTime());
  assert.equal(lundiDe(new Date(2026, 10, 9)).getTime(), new Date(2026, 10, 9).getTime());
  // Dimanche : lundi précédent.
  assert.equal(lundiDe(new Date(2026, 10, 15)).getTime(), new Date(2026, 10, 9).getTime());
  // Semaine à cheval sur deux mois.
  assert.equal(lundiDe(new Date(2026, 11, 2)).getTime(), new Date(2026, 10, 30).getTime());
});

test('jours consécutifs : minuit local, passage d’heure compris', () => {
  const jours = joursConsecutifs(new Date(2026, 9, 24), 3);
  assert.deepEqual(
    jours.map((d) => [d.getDate(), d.getHours()]),
    [
      [24, 0],
      [25, 0],
      [26, 0],
    ],
  );
});
