/**
 * Écrire une note dans le fil : texte, photos ou vidéos. Un seul choix de
 * visibilité, en un geste : cadenas « Équipe » (par défaut) ou œil
 * « Client » (devient une étape de sa page de suivi).
 *
 * La fiche appelle `photographier()` depuis sa barre d'action (bouton
 * Photo) : la photo arrive ici, prête à être publiée.
 *
 * Quitter la fiche avec une note ou une photo pas encore publiée demande
 * confirmation (« Abandonner la note ? ») au lieu de la perdre en silence.
 */

import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from 'expo-router';
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
import { useImperativeHandle, useState, type Ref } from 'react';
import { Keyboard, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { Bouton, Carte, FeuilleConfirmation, Icone, impulsion, type NomIcone } from '@/components/ui';
import { repo } from '@/data';
import { useMembre } from '@/state/session';
import { useTheme } from '@/theme/tokens';

type Piece = { uri: string; video?: boolean };

export type ComposerRef = { photographier: () => void };

type Props = {
  interventionId: string;
  /** Message court en cas de problème (permission refusée, échec) */
  onErreur: (message: string) => void;
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

export function Composer({ interventionId, onErreur, ref }: Props) {
  const t = useTheme();
  const membre = useMembre();
  const [texte, setTexte] = useState('');
  const [visibleClient, setVisibleClient] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [envoi, setEnvoi] = useState(false);
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

  useImperativeHandle(ref, () => ({ photographier: () => void photographier() }));

  async function publier() {
    if (vide || envoi) return;
    setEnvoi(true);
    try {
      await repo().commenter({ interventionId, auteurId: membre.id, texte: texte.trim(), visibleClient, photos: pieces });
      impulsion('succes');
      setTexte('');
      setPieces([]);
      setVisibleClient(false);
      Keyboard.dismiss();
    } catch {
      onErreur('La note n’a pas pu être publiée.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <>
      <Carte className="p-3">
        <TextInput
          value={texte}
          onChangeText={setTexte}
          multiline
          textAlignVertical="top"
          placeholder="Ajouter une note…"
          placeholderTextColor={t.muted}
          accessibilityLabel="Nouvelle note"
          className="min-h-[64px] px-1 py-1 text-[17px] text-ink dark:text-ink-dark"
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
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: visibleClient }}
            accessibilityLabel={visibleClient ? 'Visible par le client' : 'Réservée à l’équipe'}
            onPress={() => {
              impulsion('leger');
              setVisibleClient((v) => !v);
            }}
            className={`h-11 flex-row items-center gap-1.5 rounded-full px-3.5 ${visibleClient ? 'bg-ok-soft dark:bg-ok-softdark' : 'bg-surface2 dark:bg-surface2-dark'} active:opacity-70`}>
            <Icone nom={visibleClient ? 'oeil' : 'cadenas'} taille={15} couleur={visibleClient ? t.ok : t.muted} />
            <Text maxFontSizeMultiplier={1.3} className={`text-[14px] font-semibold ${visibleClient ? 'text-ok dark:text-ok-dark' : 'text-muted dark:text-muted-dark'}`}>
              {visibleClient ? 'Client' : 'Équipe'}
            </Text>
          </Pressable>
          <View className="flex-1" />
          <Bouton compact variante={vide ? 'secondaire' : 'principal'} onPress={publier} desactive={vide} chargement={envoi} accessibilityLabel="Publier la note">
            Publier
          </Bouton>
        </View>
      </Carte>
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
