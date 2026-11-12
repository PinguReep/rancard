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
  JOURS_MAX,
  LARGEUR_EQUIPE_DEFAUT,
  LARGEUR_EQUIPE_MAX,
  LARGEUR_EQUIPE_MIN,
  ZOOM_MAX,
  ZOOM_MIN,
  aimanterJours,
  bornerJours,
  bornerLargeurEquipe,
  bornerZoom,
  bornesJour,
  bornesJours,
  bornesLargeurEquipe,
  creneauDuJour,
  defilementApresZoom,
  directionPincement,
  facteurAxe,
  joursConsecutifs,
  largeurEquipe,
  lignesQuiTiennent,
  minutesDansJour,
  placer,
  premierJourAffiche,
  repartirLignes,
  zonesFermees,
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

test('direction du pincement : l’angle des deux doigts décide', () => {
  // L’un au-dessus de l’autre : les heures.
  assert.equal(directionPincement(10, 200), 'vertical');
  assert.equal(directionPincement(-40, -120), 'vertical');
  // Côte à côte : les jours (ou les colonnes).
  assert.equal(directionPincement(200, 20), 'horizontal');
  // En diagonale : les deux axes.
  assert.equal(directionPincement(100, 100), 'deux');
  assert.equal(directionPincement(100, 160), 'deux');
  // Limites : 60° et 30° restent en diagonale.
  assert.equal(directionPincement(100, 100 * Math.tan((60 * Math.PI) / 180) - 0.01), 'deux');
  assert.equal(directionPincement(100, 100 * Math.tan((61 * Math.PI) / 180)), 'vertical');
  assert.equal(directionPincement(100, 100 * Math.tan((29 * Math.PI) / 180)), 'horizontal');
  // Écart inconnu : le zoom des heures, comme avant.
  assert.equal(directionPincement(0, 0), 'vertical');
});

test('facteur d’un axe en diagonale : rapport des écarts, échelle du pincement sous 24 pt', () => {
  assert.equal(facteurAxe(100, 150, 9), 1.5);
  assert.equal(facteurAxe(-100, 50, 9), 0.5);
  assert.equal(facteurAxe(10, 40, 1.2), 1.2);
});

test('aimantation du nombre de jours : entier le plus proche, de 1 à 7', () => {
  assert.equal(aimanterJours(330, 330), 1);
  assert.equal(aimanterJours(330, 120), 3); // 2,75 jours
  assert.equal(aimanterJours(330, 140), 2); // 2,36 jours
  assert.equal(aimanterJours(330, 20), JOURS_MAX);
  assert.equal(aimanterJours(330, 900), 1);
  assert.equal(aimanterJours(0, 100), 1);
  assert.equal(bornerJours(0), 1);
  assert.equal(bornerJours(12), 7);
  assert.equal(bornerJours(3.4), 3);
  assert.equal(bornerJours(Number.NaN), 1);
});

test('largeur d’une colonne « Équipe » : bornes, et tout tient dans l’écran au minimum', () => {
  assert.equal(bornerLargeurEquipe(10), LARGEUR_EQUIPE_MIN);
  assert.equal(bornerLargeurEquipe(999), LARGEUR_EQUIPE_MAX);
  assert.equal(bornerLargeurEquipe(Number.NaN), LARGEUR_EQUIPE_DEFAUT);
  // Six colonnes sur 330 pt : 72 pt au moins, on défile.
  assert.deepEqual(bornesLargeurEquipe(330, 6), { min: 72, max: 260 });
  // Trois colonnes : jamais moins que le tiers de l’écran (pas de vide à droite).
  assert.deepEqual(bornesLargeurEquipe(330, 3), { min: 110, max: 260 });
  // Une seule colonne plus large que 260 pt : toute la largeur.
  assert.deepEqual(bornesLargeurEquipe(330, 1), { min: 330, max: 330 });
  assert.equal(largeurEquipe(104, 330, 3), 110);
  assert.equal(largeurEquipe(104, 330, 6), 104);
  assert.equal(largeurEquipe(400, 330, 6), 260);
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

test('premier jour affiché : le jour choisi en portrait, le lundi de sa semaine en paysage', () => {
  const jeudi = new Date(2026, 10, 12, 15, 30);
  assert.equal(premierJourAffiche(jeudi, 3, false).getTime(), new Date(2026, 10, 12).getTime());
  assert.equal(premierJourAffiche(jeudi, 7, true).getTime(), new Date(2026, 10, 9).getTime());
  assert.equal(premierJourAffiche(jeudi, 5, true).getTime(), new Date(2026, 10, 9).getTime());
  // Trois jours en paysage, jeudi choisi : mardi, mercredi, jeudi.
  assert.equal(premierJourAffiche(jeudi, 3, true).getTime(), new Date(2026, 10, 10).getTime());
  // Dimanche : lundi précédent.
  assert.equal(premierJourAffiche(new Date(2026, 10, 15), 7, true).getTime(), new Date(2026, 10, 9).getTime());
  // Semaine à cheval sur deux mois.
  assert.equal(premierJourAffiche(new Date(2026, 11, 2), 7, true).getTime(), new Date(2026, 10, 30).getTime());
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
