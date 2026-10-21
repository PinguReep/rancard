/**
 * Carte d'un véhicule dans la fiche client : marque, modèle, version,
 * plaque en monospace, année et kilométrage. Le kilométrage se modifie en
 * place : appui, saisie, validation au clavier ou au blur.
 */

import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Carte } from '@/components/ui/carte';
import { impulsion } from '@/components/ui/haptique';
import { Icone } from '@/components/ui/icone';
import { Plaque } from '@/components/ui/plaque';
import { Legende, Secondaire, Texte } from '@/components/ui/texte';
import type { Vehicule } from '@/domain/types';
import { kilometrage } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

import { libelleVehicule } from './outils';

type Props = { vehicule: Vehicule; onModifierKm: (km: number) => Promise<void> | void };

export function CarteVehicule({ vehicule, onModifierKm }: Props) {
  const t = useTheme();
  const [edition, setEdition] = useState(false);
  const [saisie, setSaisie] = useState('');

  function ouvrir() {
    setSaisie(vehicule.km != null ? String(vehicule.km) : '');
    setEdition(true);
  }

  async function valider() {
    setEdition(false);
    const chiffres = saisie.replace(/\D/g, '');
    if (!chiffres) return;
    const km = Number(chiffres);
    if (km === vehicule.km) return;
    impulsion('leger');
    await onModifierKm(km);
  }

  return (
    <Carte className="p-4">
      <Plaque plaque={vehicule.plaque} />
      <View className="mt-3 flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Texte className="font-semibold">{libelleVehicule(vehicule)}</Texte>
          <Legende numberOfLines={1}>{[vehicule.version, vehicule.annee].filter(Boolean).join(' · ') || ' '}</Legende>
        </View>
        {edition ? (
          <View className="flex-row items-center gap-2">
            <TextInput
              value={saisie}
              onChangeText={setSaisie}
              onBlur={valider}
              onSubmitEditing={valider}
              autoFocus
              keyboardType="number-pad"
              returnKeyType="done"
              accessibilityLabel="Kilométrage"
              placeholder="Kilométrage"
              placeholderTextColor={t.muted}
              className="min-h-[44px] w-36 rounded-xl border border-accent bg-surface px-3 py-2 text-right text-[17px] text-ink dark:border-accent-dark dark:bg-surface-dark dark:text-ink-dark"
            />
            <Secondaire>km</Secondaire>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={vehicule.km != null ? `Kilométrage ${kilometrage(vehicule.km)}, modifier` : 'Renseigner le kilométrage'}
            hitSlop={4}
            onPress={() => {
              impulsion('leger');
              ouvrir();
            }}
            className="min-h-[44px] flex-row items-center gap-1.5 active:opacity-70">
            {vehicule.km != null ? (
              <Texte>{kilometrage(vehicule.km)}</Texte>
            ) : (
              <Texte ton="accent">Kilométrage</Texte>
            )}
            <Icone nom="chevron.droite" taille={14} couleur={t.faint} />
          </Pressable>
        )}
      </View>
    </Carte>
  );
}
