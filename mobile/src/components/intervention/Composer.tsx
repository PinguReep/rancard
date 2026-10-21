/**
 * Écrire une note dans le fil : texte, photos ou vidéos, bascule
 * « Visible par le client » (désactivée par défaut).
 */

import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, Pressable, Switch, View } from 'react-native';

import { Bouton, Carte, Champ, Icone, Legende, Texte, impulsion, type NomIcone } from '@/components/ui';
import { repo } from '@/data';
import { useMembre } from '@/state/session';
import { useTheme } from '@/theme/tokens';

type Piece = { uri: string; video?: boolean };

type Props = {
  interventionId: string;
  /** Message court en cas de problème (permission refusée, échec) */
  onErreur: (message: string) => void;
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
      <Icone nom={nom} taille={20} />
    </Pressable>
  );
}

export function Composer({ interventionId, onErreur }: Props) {
  const t = useTheme();
  const membre = useMembre();
  const [texte, setTexte] = useState('');
  const [visibleClient, setVisibleClient] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [envoi, setEnvoi] = useState(false);

  const vide = texte.trim().length === 0 && pieces.length === 0;

  function ajouter(res: ImagePicker.ImagePickerResult) {
    if (res.canceled) return;
    setPieces((p) => [...p, ...res.assets.map((a) => ({ uri: a.uri, video: a.type === 'video' }))]);
  }

  async function photographier() {
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

  async function publier() {
    if (vide || envoi) return;
    setEnvoi(true);
    try {
      await repo().commenter({ interventionId, auteurId: membre.id, texte: texte.trim(), visibleClient, photos: pieces });
      impulsion('succes');
      setTexte('');
      setPieces([]);
      setVisibleClient(false);
    } catch {
      onErreur('La note n’a pas pu être publiée.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Carte className="p-3">
      <Champ
        type="multiligne"
        value={texte}
        onChangeText={setTexte}
        placeholder="Ajouter une note, une photo…"
        accessibilityLabel="Nouvelle note"
      />
      {pieces.length ? (
        <View className="mb-3 flex-row flex-wrap gap-2">
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
      <View className="flex-row items-center gap-2">
        {Platform.OS !== 'web' ? <BoutonIcone nom="camera" label="Prendre une photo ou une vidéo" onPress={() => void photographier()} /> : null}
        <BoutonIcone nom="piece-jointe" label="Joindre depuis la galerie" onPress={() => void choisir()} />
        <View className="flex-1" />
        <Bouton compact variante="secondaire" onPress={publier} desactive={vide} chargement={envoi} accessibilityLabel="Publier la note">
          Publier
        </Bouton>
      </View>
      <View className="mt-3 flex-row items-center justify-between border-t border-line dark:border-line-dark pt-3">
        <View className="flex-1 pr-3">
          <Texte>Visible par le client</Texte>
          <Legende>{visibleClient ? 'Apparaîtra comme une étape sur sa page de suivi.' : 'Note interne, réservée à l’équipe.'}</Legende>
        </View>
        <Switch
          value={visibleClient}
          onValueChange={(v) => {
            impulsion('leger');
            setVisibleClient(v);
          }}
          trackColor={{ true: t.accent, false: t.line }}
          ios_backgroundColor={t.line}
          accessibilityLabel="Visible par le client"
        />
      </View>
    </Carte>
  );
}
