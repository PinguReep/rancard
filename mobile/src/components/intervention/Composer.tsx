/**
 * Écrire une note dans le fil : texte, photos ou vidéos. Un seul choix de
 * visibilité, en un geste, sur deux segments toujours visibles : cadenas
 * « Équipe » (par défaut) ou œil « Client » (devient une étape de sa page
 * de suivi). En mode Client, une légende le rappelle au-dessus du champ et
 * le bouton dit à qui l’on publie (« Publier pour Hugo ») ; après chaque
 * publication, on revient à « Équipe ».
 *
 * La fiche appelle `photographier()` depuis sa barre d'action (bouton
 * Photo) : la photo arrive ici, prête à être publiée. Elle appelle
 * `repondre()` depuis un message du client (« Répondre à Yassine », 0020) :
 * le compositeur passe en « Client » et le champ prend le focus.
 *
 * Quitter la fiche avec une note ou une photo pas encore publiée demande
 * confirmation (« Abandonner la note ? ») au lieu de la perdre en silence.
 *
 * Après une note publiée pour le client, l’avis « Publié pour Hugo »
 * porte « Retirer » (8 s, sans confirmation) : une note partie du mauvais
 * côté se retire en 1 appui (P1). Ensuite, le fil propose le retrait
 * pendant 10 minutes (`FilSuivi`, `FeuilleNote`).
 */

import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from 'expo-router';
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Keyboard, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { Bouton, Carte, FeuilleConfirmation, Icone, Legende, impulsion, type NomIcone } from '@/components/ui';
import { repo } from '@/data';
import type { Client } from '@/domain/types';
import { dePrenom } from '@/lib/format';
import { useDonnees, useMembre } from '@/state/session';
import { useTheme } from '@/theme/tokens';

import { Avis, useAvis, type ActionAvis } from './Avis';
import { useRetirerNote } from './FeuilleNote';

type Piece = { uri: string; video?: boolean };

export type ComposerRef = {
  photographier: () => void;
  /** Réponse à un message du client : note visible client, champ prêt à écrire */
  repondre: () => void;
};

type Props = {
  interventionId: string;
  /** Message court en cas de problème (permission refusée, échec) */
  onErreur: (message: string) => void;
  /** Client de l’intervention (sinon lu dans les données) : « Publier pour Hugo » */
  client?: Client;
  /** Avis de la fiche : « Publié pour Hugo » avec « Retirer » après une note visible du client */
  onAvis?: (texte: string, action?: ActionAvis) => void;
  ref?: Ref<ComposerRef>;
};

function BoutonIcone({ nom, label, onPress }: { nom: NomIcone; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        impulsion('leger');
        onPress();
      }}
      className="h-11 w-11 items-center justify-center rounded-full bg-surface2 dark:bg-surface2-dark active:opacity-70">
      <Icone nom={nom} taille={19} />
    </Pressable>
  );
}

/** Un des deux segments « Équipe » / « Client » : l’actif en plein, l’autre calme. */
function Segment({ nom, label, accessibilityLabel, actif, onPress }: { nom: NomIcone; label: string; accessibilityLabel: string; actif: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: actif }}
      onPress={() => {
        if (actif) return;
        impulsion('leger');
        onPress();
      }}
      className={`min-h-[44px] flex-1 flex-row items-center justify-center gap-1.5 rounded-full px-3 ${
        actif ? 'bg-accent dark:bg-accent-fond' : 'active:opacity-70'
      }`}>
      <Icone nom={nom} taille={15} couleur={actif ? t.blanc : t.muted} />
      <Text maxFontSizeMultiplier={1.3} className={`text-[15px] font-semibold ${actif ? 'text-white' : 'text-muted dark:text-muted-dark'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Composer({ interventionId, onErreur, client, onAvis, ref }: Props) {
  const t = useTheme();
  const membre = useMembre();
  // Prénom du client de l’intervention : le bouton dit à qui la note est publiée.
  const prenomDonnees = useDonnees((s) => {
    const i = s.interventions.find((x) => x.id === interventionId);
    return (i && s.clients.find((c) => c.id === i.clientId)?.prenom) || null;
  });
  const prenomClient = client?.prenom || prenomDonnees;
  // Sans avis de la fiche, l’avis s’affiche sous le compositeur.
  const [avisLocal, montrerAvisLocal] = useAvis();
  const avis = onAvis ?? montrerAvisLocal;
  const retirer = useRetirerNote(prenomClient, avis);
  const [texte, setTexte] = useState('');
  const [visibleClient, setVisibleClient] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const champ = useRef<TextInput>(null);
  const navigation = useNavigation();
  /** Départ de la fiche suspendu le temps de confirmer l’abandon du brouillon */
  const [depart, setDepart] = useState<NavigationAction | null>(null);

  const vide = texte.trim().length === 0 && pieces.length === 0;

  // Retour (bouton, geste ou lien) avec un brouillon : on demande avant de le perdre.
  usePreventRemove(!vide && !envoi, ({ data }) => {
    Keyboard.dismiss();
    setDepart(data.action);
  });

  function abandonner() {
    const action = depart;
    setDepart(null);
    // La feuille se ferme d’abord, puis la fiche se retire.
    if (action) setTimeout(() => navigation.dispatch(action), 260);
  }

  function ajouter(res: ImagePicker.ImagePickerResult) {
    if (res.canceled) return;
    setPieces((p) => [...p, ...res.assets.map((a) => ({ uri: a.uri, video: a.type === 'video' }))]);
  }

  async function photographier() {
    if (Platform.OS === 'web') {
      await choisir();
      return;
    }
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        onErreur('Autorisez l’appareil photo dans les Réglages du téléphone.');
        return;
      }
      ajouter(await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.7, videoMaxDuration: 60 }));
    } catch {
      onErreur('Appareil photo indisponible.');
    }
  }

  async function choisir() {
    try {
      ajouter(
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.7,
          allowsMultipleSelection: true,
          selectionLimit: 6,
        }),
      );
    } catch {
      onErreur('Galerie indisponible.');
    }
  }

  useImperativeHandle(ref, () => ({
    photographier: () => void photographier(),
    repondre: () => {
      setVisibleClient(true);
      // Le champ prend le focus : le clavier s’ouvre et la fiche défile jusqu’à lui.
      setTimeout(() => champ.current?.focus(), 50);
    },
  }));

  async function publier() {
    if (vide || envoi) return;
    setEnvoi(true);
    const pourClient = visibleClient;
    try {
      const cree = await repo().commenter({ interventionId, auteurId: membre.id, texte: texte.trim(), visibleClient, photos: pieces });
      impulsion('succes');
      setTexte('');
      setPieces([]);
      setVisibleClient(false);
      Keyboard.dismiss();
      // P1 : une note partie chez le client par erreur se retire en 1 appui, le temps de l’avis.
      if (pourClient) {
        avis(prenomClient ? `Publié pour ${prenomClient}` : 'Publié pour le client', {
          libelle: 'Retirer',
          onPress: () => void retirer(cree.id),
        });
      }
    } catch {
      onErreur('La note n’a pas pu être publiée.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <>
      <Carte className="p-3">
        {/* Pour qui : choisi avant d’écrire, lisible d’un coup d’œil. */}
        <View className="flex-row gap-1 rounded-full bg-surface2 p-1 dark:bg-surface2-dark">
          <Segment nom="cadenas" label="Équipe" accessibilityLabel="Réservée à l’équipe" actif={!visibleClient} onPress={() => setVisibleClient(false)} />
          <Segment nom="oeil" label="Client" accessibilityLabel="Visible par le client" actif={visibleClient} onPress={() => setVisibleClient(true)} />
        </View>
        {visibleClient ? (
          <View className="ml-1 mt-2 flex-row items-center gap-1.5">
            <Icone nom="oeil" taille={13} couleur={t.accent} />
            <Legende ton="accent" className="flex-1 font-semibold">
              {prenomClient ? `Visible sur la page de suivi ${dePrenom(prenomClient)}` : 'Visible sur la page de suivi du client'}
            </Legende>
          </View>
        ) : null}
        <TextInput
          ref={champ}
          value={texte}
          onChangeText={setTexte}
          multiline
          textAlignVertical="top"
          placeholder="Ajouter une note…"
          placeholderTextColor={t.muted}
          accessibilityLabel="Nouvelle note"
          className="mt-2 min-h-[64px] px-1 py-1 text-[17px] text-ink dark:text-ink-dark"
        />
        {pieces.length ? (
          <View className="mb-2 mt-1 flex-row flex-wrap gap-2">
            {pieces.map((p, idx) => (
              <View key={`${p.uri}-${idx}`} className="h-16 w-16 overflow-hidden rounded-xl bg-surface2 dark:bg-surface2-dark">
                {p.video ? (
                  <View className="flex-1 items-center justify-center bg-ink dark:bg-surface2-dark">
                    <Icone nom="camera" taille={18} couleur={t.blanc} />
                  </View>
                ) : (
                  <Image source={{ uri: p.uri }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Retirer la pièce jointe ${idx + 1}`}
                  hitSlop={10}
                  onPress={() => setPieces((liste) => liste.filter((_, j) => j !== idx))}
                  className="absolute right-0.5 top-0.5 h-6 w-6 items-center justify-center rounded-full bg-black/60 active:opacity-70">
                  <Icone nom="fermer" taille={12} couleur={t.blanc} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <View className="mt-1 flex-row items-center gap-2">
          {Platform.OS !== 'web' ? <BoutonIcone nom="camera" label="Prendre une photo ou une vidéo" onPress={() => void photographier()} /> : null}
          <BoutonIcone nom="piece-jointe" label="Joindre depuis la galerie" onPress={() => void choisir()} />
          <View className="flex-1" />
          {visibleClient ? (
            <Bouton
              compact
              variante={vide ? 'secondaire' : 'principal'}
              onPress={publier}
              desactive={vide}
              chargement={envoi}
              className="shrink"
              accessibilityLabel={prenomClient ? `Publier pour ${prenomClient}` : 'Publier pour le client'}>
              {prenomClient ? `Publier pour ${prenomClient}` : 'Publier pour le client'}
            </Bouton>
          ) : (
            <Bouton compact variante={vide ? 'secondaire' : 'principal'} onPress={publier} desactive={vide} chargement={envoi} accessibilityLabel="Publier la note">
              Publier
            </Bouton>
          )}
        </View>
      </Carte>
      {onAvis ? null : <Avis texte={avisLocal} />}
      <FeuilleConfirmation
        ouverte={depart !== null}
        onFermer={() => setDepart(null)}
        titre="Abandonner la note ?"
        texte="Elle n’a pas encore été publiée. Si vous quittez la fiche, elle sera perdue."
        libelle="Abandonner la note"
        variante="danger"
        onConfirmer={abandonner}
      />
    </>
  );
}
