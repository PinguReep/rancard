#!/usr/bin/env node
/**
 * Génère l'enregistrement de l'appel de démonstration (appel a1) :
 * mobile/assets/demo/appel-demo.mp3.
 *
 *   cd mobile && node scripts/generer-audio-demo.mjs     (ffmpeg dans le PATH)
 *
 * Aucune voix : un son entièrement synthétique, calé sur la transcription
 * fictive de src/data/demo/ecoutes-demo.json. Chaque réplique devient une
 * suite de « syllables » (notes harmoniques à enveloppe douce, deux formants
 * tirés au hasard, intonation qui descend en fin de phrase), plus aiguës pour
 * le réceptionniste que pour l'appelant, séparées par les silences de la
 * transcription. On entend qui parle et quand, sans un mot : de quoi essayer
 * le lecteur, le fil et la position de lecture. Tirage déterministe (graine
 * fixe) : relancé, le script redonne le même fichier. Libre de droits.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { a1 } = JSON.parse(readFileSync(path.join(racine, 'src/data/demo/ecoutes-demo.json'), 'utf8'));
const sortie = path.join(racine, 'assets/demo/appel-demo.mp3');

const FREQ = 16000;
/** Débit de parole simulé : caractères par seconde. */
const DEBIT = 15;

/** Générateur pseudo-aléatoire à graine fixe (mulberry32). */
function alea(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r = alea(20261029);
const repliques = a1.repliques;
const duree = (i) => {
  const parle = repliques[i].texte.length / DEBIT;
  const suivante = repliques[i + 1]?.t;
  return suivante === undefined ? parle : Math.min(parle, suivante - repliques[i].t - 0.5);
};
const fin = repliques.at(-1).t + duree(repliques.length - 1) + 1.2;
const echantillons = new Float32Array(Math.ceil(fin * FREQ));

/** Une syllabe : note harmonique, deux formants, enveloppe en cosinus. */
function syllabe(debut, longueur, f0, amplitude) {
  const f1 = 350 + r() * 450;
  const f2 = 1000 + r() * 1200;
  const poids = [];
  for (let k = 1; k <= 14; k++) {
    const fk = k * f0;
    poids.push(fk > 3600 ? 0 : Math.exp(-(((fk - f1) / 180) ** 2)) + 0.7 * Math.exp(-(((fk - f2) / 300) ** 2)) + 0.08 / k);
  }
  const somme = poids.reduce((a, b) => a + b, 0);
  const n0 = Math.floor(debut * FREQ);
  const n1 = Math.min(Math.floor((debut + longueur) * FREQ), echantillons.length);
  const attaque = 0.025 * FREQ;
  const relache = 0.05 * FREQ;
  let phase = 0;
  for (let n = n0; n < n1; n++) {
    const i = n - n0;
    const env = Math.min(1, i < attaque ? 0.5 - 0.5 * Math.cos((Math.PI * i) / attaque) : 1, n1 - n < relache ? 0.5 - 0.5 * Math.cos((Math.PI * (n1 - n)) / relache) : 1);
    phase += (2 * Math.PI * f0 * (1 + 0.025 * Math.sin((2 * Math.PI * 5 * i) / FREQ))) / FREQ;
    let s = 0;
    for (let k = 0; k < poids.length; k++) if (poids[k]) s += poids[k] * Math.sin((k + 1) * phase);
    echantillons[n] += (amplitude * env * s) / somme;
  }
}

repliques.forEach((rep, i) => {
  const base = rep.role === 'agent' ? 200 : 128;
  const debut = rep.t + 0.15;
  const longueur = duree(i);
  let pos = debut;
  while (pos < debut + longueur - 0.12) {
    const d = 0.13 + r() * 0.12;
    const avance = (pos - debut) / longueur;
    const f0 = base * (1.06 - 0.14 * avance) * (1 + (r() - 0.5) * 0.12);
    syllabe(pos, d, f0, 0.5 * (0.75 + r() * 0.25));
    pos += d + (r() < 0.3 ? 0.1 + r() * 0.08 : 0.03 + r() * 0.03);
  }
});
// Léger souffle de ligne téléphonique.
for (let n = 0; n < echantillons.length; n++) echantillons[n] += (r() - 0.5) * 0.004;

// WAV 16 bits mono, puis MP3 32 kbit/s par ffmpeg.
const pcm = Buffer.alloc(echantillons.length * 2);
echantillons.forEach((v, n) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), n * 2));
const entete = Buffer.alloc(44);
entete.write('RIFF', 0);
entete.writeUInt32LE(36 + pcm.length, 4);
entete.write('WAVEfmt ', 8);
entete.writeUInt32LE(16, 16);
entete.writeUInt16LE(1, 20);
entete.writeUInt16LE(1, 22);
entete.writeUInt32LE(FREQ, 24);
entete.writeUInt32LE(FREQ * 2, 28);
entete.writeUInt16LE(2, 32);
entete.writeUInt16LE(16, 34);
entete.write('data', 36);
entete.writeUInt32LE(pcm.length, 40);

const dossier = mkdtempSync(path.join(tmpdir(), 'rencar-audio-'));
try {
  const wav = path.join(dossier, 'appel-demo.wav');
  writeFileSync(wav, Buffer.concat([entete, pcm]));
  execFileSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-i', wav, '-map_metadata', '-1', '-ac', '1', '-ar', String(FREQ), '-codec:a', 'libmp3lame', '-b:a', '32k',
      '-metadata', 'title=Appel de démonstration (son synthétique, sans voix)', sortie],
    { stdio: 'inherit' },
  );
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
console.log(`${path.relative(racine, sortie)} : ${fin.toFixed(1)} s (dureeSec de l’appel a1 : ${Math.round(fin)})`);
