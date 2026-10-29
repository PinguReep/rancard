/**
 * « Accord reçu » (D3) : la seule façon de lever une attente d’accord, pour
 * tout le monde, jamais en un appui. On note qui a donné son accord, comment
 * (aucun canal présélectionné : « Enregistrer l’accord » reste inactif tant
 * qu’on n’a pas choisi), et, avec `voirPrix` seulement, le nouveau montant.
 * L’accord devient une donnée côté serveur (`noter_accord`) : trace d’équipe,
 * levée, phrase client et notification sont produites par la base.
 *
 * Repris de la feuille Accord de la v2b, corrigé : plus de « Téléphone »
 * présélectionné (un employé enregistrait un accord en deux appuis sans
 * rien choisir), aucune mention de montant sans « Voir les montants »,
 * feuille inerte le temps de la garde (elle s’ouvre sous le doigt qui vient
 * de toucher « Accord reçu »). `onEnregistrer` lève une erreur en cas de
 * refus : la feuille reste ouverte et l’affiche sous le bouton.
 */

import { useState, type ReactElement } from 'react';
import { ScrollView, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Puce, Puces } from '@/components/nouvelle-intervention/Puce';
import { Bouton, Champ, Erreur, Feuille, GARDE_MS, Legende, Secondaire } from '@/components/ui';
import { CANAUX_ACCORD, DE_MAX, LEVEES_CLIENT, LISTE_CANAUX_ACCORD } from '@/domain/statuts';
import type { CanalAccord, Client, Intervention, Vehicule } from '@/domain/types';
import { dePrenom, euros, titreVoiture, voitureEtPlaque } from '@/lib/format';
import { usePermissions } from '@/state/session';

export type PropsFeuilleAccord = {
  cible: { intervention: Intervention; client?: Client; vehicule?: Vehicule } | null;
  onFermer: () => void;
  onEnregistrer: (a: { de: string; canal: CanalAccord; montant?: number }) => Promise<void>;
};

/** « 520 », « 520,50 », « 1 290 € » : montant saisi, null si vide, NaN si illisible. */
function lireMontant(saisie: string): number | null {
  const propre = saisie.replace(/[\s  €]/g, '').replace(',', '.');
  if (!propre) return null;
  return /^\d+(\.\d{1,2})?$/.test(propre) ? Number(propre) : NaN;
}

/** 389 → « 389 », 389.5 → « 389,5 » : le montant actuel, prêt à corriger au clavier. */
const montantSaisi = (n?: number) => (n == null ? '' : String(n).replace('.', ','));

export function FeuilleAccord({ cible, onFermer, onEnregistrer }: PropsFeuilleAccord): ReactElement {
  const i = cible?.intervention ?? null;
  const client = cible?.client;
  const nomClient = client ? `${client.prenom} ${client.nom}`.trim() : '';
  const legende = [titreVoiture(cible?.vehicule), nomClient].filter(Boolean).join(' · ');

  return (
    // Ouverte par un geste (« Accord reçu » sur la carte ou la barre) : inerte comme la garde.
    <Feuille ouverte={cible !== null} onFermer={onFermer} titre="Accord reçu" legende={i ? legende : undefined} inerteMs={GARDE_MS}>
      {i ? (
        // Chaque ouverture repart du client, sans canal, avec le montant actuel.
        <Contenu key={i.id} intervention={i} client={client} vehicule={cible?.vehicule} onEnregistrer={onEnregistrer} />
      ) : null}
    </Feuille>
  );
}

type PropsContenu = {
  intervention: Intervention;
  client?: Client;
  vehicule?: Vehicule;
  onEnregistrer: PropsFeuilleAccord['onEnregistrer'];
};

function Contenu({ intervention: i, client, vehicule, onEnregistrer }: PropsContenu) {
  const p = usePermissions();
  const insets = useSafeAreaInsets();
  const nomClient = client ? `${client.prenom} ${client.nom}`.trim() : '';

  const [autre, setAutre] = useState(!nomClient);
  const [nom, setNom] = useState('');
  const [canal, setCanal] = useState<CanalAccord | null>(null);
  const [montant, setMontant] = useState(() => montantSaisi(i.montantEstime));
  const [erreur, setErreur] = useState<string | null>(null);

  // Le clavier (nom, montant) ne masque pas le bouton.
  const { height: clavier } = useReanimatedKeyboardAnimation();
  const sousClavier = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, -clavier.value - insets.bottom) }));

  const de = (autre ? nom : nomClient).trim().slice(0, DE_MAX);
  const pret = Boolean(canal && de);

  async function enregistrer() {
    if (!canal || !de) return;
    let nouveau: number | undefined;
    if (p.voirPrix) {
      const lu = lireMontant(montant);
      if (lu !== null && Number.isNaN(lu)) {
        setErreur('Montant illisible : chiffres seulement, par exemple 520.');
        return;
      }
      // Montant inchangé : rien à tracer (J7).
      if (lu !== null && lu !== i.montantEstime) nouveau = lu;
    }
    setErreur(null);
    try {
      await onEnregistrer({ de, canal, montant: nouveau });
    } catch (e) {
      setErreur((e as Error).message || 'Impossible d’enregistrer l’accord.');
    }
  }

  const prenom = client?.prenom?.trim() || 'Le client';

  return (
    <Animated.View style={sousClavier} className="shrink">
      <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
        <Legende accessibilityRole="header" className="mb-1.5 ml-1 font-medium">
          De qui ?
        </Legende>
        <Puces>
          {nomClient ? (
            <Puce
              label={nomClient}
              active={!autre}
              onPress={() => {
                setAutre(false);
                setErreur(null);
              }}
              accessibilityLabel={`Accord ${dePrenom(nomClient)}`}
            />
          ) : null}
          <Puce
            label="Autre personne"
            active={autre}
            onPress={() => {
              setAutre(true);
              setErreur(null);
            }}
            accessibilityLabel="Accord d’une autre personne"
          />
        </Puces>
        {autre ? (
          <Champ
            className="mb-0 mt-3"
            libelle="Nom"
            value={nom}
            onChangeText={setNom}
            maxLength={DE_MAX}
            placeholder="Ex. son conjoint, son employeur"
            autoCapitalize="words"
            // Choisie exprès (le client a un nom) : le clavier suit l’appui.
            autoFocus={Boolean(nomClient)}
            returnKeyType="done"
          />
        ) : null}

        <Legende accessibilityRole="header" className="mb-1.5 ml-1 mt-5 font-medium">
          Comment ?
        </Legende>
        <Puces>
          {LISTE_CANAUX_ACCORD.map((c) => (
            <Puce
              key={c}
              label={CANAUX_ACCORD[c].label}
              active={canal === c}
              onPress={() => {
                setCanal(c);
                setErreur(null);
              }}
              accessibilityLabel={`Accord donné ${CANAUX_ACCORD[c].phrase}`}
            />
          ))}
        </Puces>

        {p.voirPrix ? (
          <Champ
            className="mb-0 mt-5"
            libelle="Nouveau montant"
            type="nombre"
            // Pavé numérique avec la virgule (centimes).
            keyboardType="decimal-pad"
            value={montant}
            onChangeText={(v) => {
              setMontant(v);
              setErreur(null);
            }}
            placeholder="Montant en euros"
            aide={i.montantEstime != null ? `Montant actuel : ${euros(i.montantEstime)}` : 'Aucun montant estimé pour l’instant.'}
            returnKeyType="done"
          />
        ) : null}

        {LEVEES_CLIENT.attente_accord ? (
          <Secondaire className="ml-1 mt-5">{`${prenom} lira « ${LEVEES_CLIENT.attente_accord} »`}</Secondaire>
        ) : null}
        <View className="h-1" />
      </ScrollView>

      <View className="mt-4">
        <Bouton onPress={enregistrer} desactive={!pret} accessibilityLabel={`Enregistrer l’accord pour ${voitureEtPlaque(vehicule)}`}>
          Enregistrer l’accord
        </Bouton>
        {erreur ? (
          <Erreur className="ml-1 mt-2">{erreur}</Erreur>
        ) : !canal ? (
          <Legende className="ml-1 mt-2">Choisissez comment l’accord a été donné.</Legende>
        ) : !de ? (
          <Legende className="ml-1 mt-2">Indiquez qui a donné son accord.</Legende>
        ) : null}
      </View>
    </Animated.View>
  );
}
