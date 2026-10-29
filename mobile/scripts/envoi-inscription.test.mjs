/**
 * Tests de l'automate d'envoi de « Créer un compte » (vérification
 * anti-robot) : `src/components/auth/envoi-inscription.ts`, module pur que
 * Node lit directement (types effacés, Node 22.18 et plus).
 *
 * Usage : npm run tester   (ou node --test scripts/envoi-inscription.test.mjs)
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  affichage,
  ECHECS_AVANT_ASSISTANCE,
  etatInitial,
  MESSAGE_SANS_JETON_REFUSE,
  MESSAGES_PANNE,
  transition,
} from '../src/components/auth/envoi-inscription.ts';

/** Joue une suite d'évènements ; rend l'état final et tous les effets, dans l'ordre. */
function jouer(evenements, etat = etatInitial(true)) {
  const effets = [];
  for (const ev of evenements) {
    const r = transition(etat, ev);
    etat = r.etat;
    effets.push(...r.effets);
  }
  return { etat, effets };
}

const DEMANDE = { type: 'demande' };
const envoyer = (jeton) => ({ type: 'envoyer', jeton });
const RELANCER = { type: 'relancer' };

test('démonstration ou sans clé : envoi direct sans jeton, un seul malgré le double appui', () => {
  const { etat, effets } = jouer([DEMANDE, DEMANDE, DEMANDE], etatInitial(false));
  assert.deepEqual(effets, [envoyer(null)]);
  assert.equal(etat.enCours, true);
});

test('jeton prêt : l’appui part avec lui, un double appui n’envoie rien de plus', () => {
  const { etat, effets } = jouer([{ type: 'jeton', jeton: 'j1' }, DEMANDE, DEMANDE]);
  assert.deepEqual(effets, [envoyer('j1')]);
  assert.equal(etat.jeton, null, 'un jeton ne sert qu’une fois');
  assert.equal(affichage(etat).attente, false);
});

test('jeton pas encore là : « Vérification en cours… », puis l’envoi part seul à son arrivée', () => {
  let r = jouer([DEMANDE]);
  assert.deepEqual(r.effets, []);
  assert.equal(affichage(r.etat).attente, true);
  r = jouer([{ type: 'jeton', jeton: 'j1' }, { type: 'jeton', jeton: 'j2' }], r.etat);
  assert.deepEqual(r.effets, [envoyer('j1')], 'le second jeton, arrivé pendant l’envoi, attend');
  assert.equal(r.etat.jeton, 'j2');
});

test('refus du serveur : le message reste malgré le jeton suivant, l’envoi ne repart pas seul', () => {
  const { etat, effets } = jouer([
    { type: 'jeton', jeton: 'j1' },
    DEMANDE,
    { type: 'refus', raison: 'refusee', message: 'La vérification anti-robot n’a pas abouti. Réessayez.' },
    { type: 'jeton', jeton: null },
    { type: 'jeton', jeton: 'j2' },
  ]);
  assert.deepEqual(effets, [envoyer('j1'), RELANCER], 'le jeton suivant se prépare tout de suite');
  assert.deepEqual(etat.echec, { message: 'La vérification anti-robot n’a pas abouti. Réessayez.', origine: 'serveur' });
  assert.equal(etat.jeton, 'j2');
  // « Réessayer » (ou « Créer mon compte ») : part avec le jeton déjà prêt.
  const suite = jouer([DEMANDE], etat);
  assert.deepEqual(suite.effets, [envoyer('j2')]);
  assert.equal(suite.etat.echec, null);
});

test('panne du widget puis rétablissement seul : l’échec s’efface et l’envoi demandé repart', () => {
  const { etat, effets } = jouer([DEMANDE, { type: 'panne', raison: 'erreur' }]);
  assert.deepEqual(etat.echec, { message: MESSAGES_PANNE.erreur, origine: 'widget' });
  assert.deepEqual(effets, []);
  const suite = jouer([{ type: 'jeton', jeton: 'j1' }], etat);
  assert.deepEqual(suite.effets, [envoyer('j1')]);
  assert.equal(suite.etat.echec, null);
});

test('« Réessayer » après une panne : relance le widget sans envoyer', () => {
  const { etat, effets } = jouer([{ type: 'panne', raison: 'chargement' }, { type: 'reessayer' }]);
  assert.deepEqual(effets, [RELANCER]);
  assert.equal(etat.echec, null);
  assert.equal(etat.voulu, false, 'formulaire pas encore envoyé : rien ne part');
});

test('widget non pris en charge : l’envoi part sans jeton, le serveur décide', () => {
  const r = jouer([{ type: 'panne', raison: 'non_pris_en_charge' }, DEMANDE]);
  assert.deepEqual(r.effets, [envoyer(null)]);
  // Pendant l'attente du jeton, la panne fait partir l'envoi aussitôt.
  const attente = jouer([DEMANDE, { type: 'panne', raison: 'non_pris_en_charge' }]);
  assert.deepEqual(attente.effets, [envoyer(null)]);
});

test('trois pannes du widget : envoi sans jeton ; le délai de la case non cochée ne compte pas', () => {
  const pannes = [{ type: 'panne', raison: 'erreur' }, { type: 'panne', raison: 'silence' }];
  let r = jouer([...pannes, { type: 'panne', raison: 'delai' }, { type: 'panne', raison: 'delai' }]);
  assert.equal(r.etat.sansJeton, false);
  r = jouer([{ type: 'panne', raison: 'chargement' }, DEMANDE], r.etat);
  assert.equal(r.etat.sansJeton, true);
  assert.deepEqual(r.effets, [envoyer(null)]);
});

test('envoi sans jeton refusé (vérification exigée) : message propre à l’appareil et assistance', () => {
  const { etat, effets } = jouer([
    { type: 'panne', raison: 'non_pris_en_charge' },
    DEMANDE,
    { type: 'refus', raison: 'absente', message: 'Mettez à jour l’app Rencar pour créer un compte.' },
  ]);
  assert.deepEqual(effets, [envoyer(null)], 'widget inutilisable ici : pas de relance');
  assert.deepEqual(etat.echec, { message: MESSAGE_SANS_JETON_REFUSE, origine: 'serveur' });
  assert.equal(affichage(etat).assistance, true);
  // Une nouvelle panne du widget ne remplace pas le refus affiché.
  const suite = jouer([{ type: 'panne', raison: 'non_pris_en_charge' }], etat);
  assert.equal(suite.etat.echec.origine, 'serveur');
});

test('assistance après trois échecs, même sans échec affiché', () => {
  const { etat } = jouer([
    { type: 'panne', raison: 'delai' },
    { type: 'panne', raison: 'delai' },
    { type: 'panne', raison: 'delai' },
    { type: 'jeton', jeton: 'j1' },
  ]);
  assert.equal(etat.echecs, ECHECS_AVANT_ASSISTANCE);
  assert.equal(etat.echec, null);
  assert.equal(affichage(etat).assistance, true);
});

test('succès : pas de relance (aucun défi inutile) ; au retour sur l’écran, le jeton est redemandé', () => {
  const { etat, effets } = jouer([{ type: 'jeton', jeton: 'j1' }, DEMANDE, { type: 'succes' }]);
  assert.deepEqual(effets, [envoyer('j1')]);
  const retour = jouer([DEMANDE], etat);
  assert.deepEqual(retour.effets, [RELANCER]);
  assert.equal(affichage(retour.etat).attente, true);
});

test('autre erreur (réseau, limite) : relance du widget, aucun échec de vérification affiché', () => {
  const { etat, effets } = jouer([{ type: 'jeton', jeton: 'j1' }, DEMANDE, { type: 'erreur' }]);
  assert.deepEqual(effets, [envoyer('j1'), RELANCER]);
  assert.equal(etat.echec, null);
  assert.equal(etat.enCours, false);
});

test('formulaire devenu invalide au départ automatique : rien n’est parti, le jeton est gardé', () => {
  const { etat } = jouer([DEMANDE, { type: 'jeton', jeton: 'j1' }, { type: 'invalide', jeton: 'j1' }]);
  assert.equal(etat.jeton, 'j1');
  assert.equal(etat.enCours, false);
  assert.equal(etat.voulu, false);
});
