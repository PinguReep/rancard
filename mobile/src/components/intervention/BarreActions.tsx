/**
 * Barre d'action en bas de la fiche, sous le pouce : Photo, Bloquer (ou
 * Débloquer) et le geste suivant en grand. Les gestes viennent de
 * `actionsPossibles`, jamais inventés ici.
 */

import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Feuille, Groupe, Icone, Ligne, Texte, impulsion } from '@/components/ui';
import { Verre } from '@/components/ui/verre';
import { actionsPossibles, type Action } from '@/domain/statuts';
import type { Intervention } from '@/domain/types';
import { halo, useTheme } from '@/theme/tokens';

type Props = {
  intervention: Intervention;
  onAction: (a: Action) => Promise<void> | void;
  onPhoto: () => void;
};

/** Hauteur de la barre, pour réserver la place sous le contenu. */
export const HAUTEUR_BARRE = 76;

const cle = (a: Action) => `${a.type}-${a.vers ?? 'aucun'}`;

function Carre({ icone, libelle, couleur, onPress }: { icone: 'camera' | 'pause' | 'valider'; libelle: string; couleur?: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      onPress={() => {
        impulsion('leger');
        onPress();
      }}
      className="h-[58px] w-[62px] items-center justify-center gap-1 rounded-[20px] bg-black/5 dark:bg-white/10 active:opacity-70">
      <Icone nom={icone} taille={20} couleur={couleur ?? t.ink} poids={icone === 'pause' ? 'bold' : 'medium'} />
      <Text maxFontSizeMultiplier={1.2} className="text-[11px] font-semibold text-muted dark:text-muted-dark">
        {libelle}
      </Text>
    </Pressable>
  );
}

export function BarreActions({ intervention: i, onAction, onPhoto }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [blocages, setBlocages] = useState(false);

  const actions = actionsPossibles(i);
  const principale = actions.find((a) => a.principal);
  const choixBlocage = actions.filter((a) => a.type === 'blocage');
  const debloquer = choixBlocage.find((a) => a.vers === null);

  async function lancer(a: Action) {
    if (enCours) return;
    setEnCours(cle(a));
    try {
      await onAction(a);
    } finally {
      setEnCours(null);
    }
  }

  return (
    <View pointerEvents="box-none" className="absolute bottom-0 left-0 right-0 px-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
      <Verre style={{ borderRadius: 30, padding: 8, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Carre icone="camera" libelle="Photo" onPress={onPhoto} />
        {debloquer ? (
          <Carre icone="pause" libelle="Débloquer" couleur={t.warn} onPress={() => void lancer(debloquer)} />
        ) : choixBlocage.length ? (
          <Carre icone="pause" libelle="Bloquer" couleur={t.warn} onPress={() => setBlocages(true)} />
        ) : null}
        {principale ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${principale.label}, action principale`}
            disabled={enCours !== null}
            onPress={() => {
              impulsion('moyen');
              void lancer(principale);
            }}
            style={t.scheme === 'dark' ? halo(t.accentFond, 18, 0.65) : undefined}
            className={`h-[58px] flex-1 flex-row items-center justify-center gap-2.5 rounded-[20px] bg-accent dark:bg-accent-fond ${enCours ? 'opacity-70' : 'active:opacity-80'}`}>
            {enCours === cle(principale) ? (
              <ActivityIndicator color={t.blanc} />
            ) : (
              <>
                <Icone nom="valider" taille={20} couleur={t.blanc} poids="bold" />
                <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit className="text-[18px] font-bold text-white">
                  {principale.label}
                </Text>
              </>
            )}
          </Pressable>
        ) : (
          <View className="h-[58px] flex-1 items-center justify-center">
            <Texte ton="muted" className="text-[15px]">
              {i.statut === 'livre' ? 'Véhicule livré' : 'Aucune étape à suivre'}
            </Texte>
          </View>
        )}
      </Verre>

      <Feuille ouverte={blocages} onFermer={() => setBlocages(false)} titre="Qu’est-ce qui bloque ?">
        <Groupe>
          {choixBlocage.map((a, k) => (
            <Ligne
              key={cle(a)}
              derniere={k === choixBlocage.length - 1}
              onPress={() => {
                setBlocages(false);
                void lancer(a);
              }}
              accessibilityLabel={`Signaler : ${a.label}`}>
              <Icone nom="pause" taille={14} couleur={t.warn} poids="bold" />
              <Texte className="flex-1">{a.label}</Texte>
            </Ligne>
          ))}
        </Groupe>
      </Feuille>
    </View>
  );
}
