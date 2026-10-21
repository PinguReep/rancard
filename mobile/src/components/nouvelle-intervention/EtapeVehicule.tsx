/**
 * Étape 2 : choisir un véhicule du client ou en saisir un autre. Sans
 * véhicule connu (nouveau client), le formulaire s'affiche directement.
 */

import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { FormulaireVehicule, type ErreursVehicule, type ValeursVehicule } from '@/components/clients/FormulaireVehicule';
import { libelleVehicule } from '@/components/clients/outils';
import { Bouton } from '@/components/ui/bouton';
import { Groupe, Ligne } from '@/components/ui/carte';
import { Icone } from '@/components/ui/icone';
import { Legende, Mono, Secondaire, Texte } from '@/components/ui/texte';
import type { Vehicule } from '@/domain/types';
import { kilometrage } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

type Props = {
  vehicules: Vehicule[];
  /** true = formulaire « autre véhicule » affiché */
  autre: boolean;
  onAutre: () => void;
  onRetourListe: () => void;
  valeurs: ValeursVehicule;
  onChangeValeurs: (v: ValeursVehicule) => void;
  erreurs: ErreursVehicule;
  onChoisir: (v: Vehicule) => void;
  onContinuer: () => void;
};

export function EtapeVehicule({ vehicules, autre, onAutre, onRetourListe, valeurs, onChangeValeurs, erreurs, onChoisir, onContinuer }: Props) {
  const t = useTheme();

  if (autre || vehicules.length === 0) {
    return (
      <Animated.View entering={FadeIn.duration(200)}>
        <View className="mb-4 flex-row items-center justify-between">
          <Texte className="font-semibold">{vehicules.length ? 'Autre véhicule' : 'Véhicule'}</Texte>
          {vehicules.length ? (
            <Bouton variante="discret" compact onPress={onRetourListe}>
              Véhicules du client
            </Bouton>
          ) : null}
        </View>
        <FormulaireVehicule valeurs={valeurs} onChange={onChangeValeurs} erreurs={erreurs} autoFocus onSubmit={onContinuer} />
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Groupe titre="Véhicules du client">
        {vehicules.map((v, idx) => (
          <Ligne
            key={v.id}
            onPress={() => onChoisir(v)}
            derniere={idx === vehicules.length - 1}
            accessibilityLabel={`${libelleVehicule(v)}, ${v.plaque}`}>
            <View className="h-9 w-9 items-center justify-center rounded-full bg-surface2 dark:bg-surface2-dark">
              <Icone nom="voiture" taille={18} couleur={t.muted} />
            </View>
            <View className="flex-1">
              <Texte numberOfLines={1} className="font-semibold">
                {libelleVehicule(v)}
              </Texte>
              <Secondaire numberOfLines={1}>
                {[v.version, v.annee ? `${v.annee}` : null, v.km != null ? kilometrage(v.km) : null].filter(Boolean).join(' · ') || 'Détails à compléter'}
              </Secondaire>
            </View>
            <Mono>{v.plaque}</Mono>
            <Icone nom="chevron.droite" taille={16} couleur={t.faint} />
          </Ligne>
        ))}
      </Groupe>
      <Bouton variante="secondaire" icone={<Icone nom="plus" taille={18} />} onPress={onAutre}>
        Autre véhicule
      </Bouton>
      <Legende className="mt-3 text-center">Choisissez le véhicule concerné.</Legende>
    </Animated.View>
  );
}
