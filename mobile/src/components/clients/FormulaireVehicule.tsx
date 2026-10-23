/**
 * Champs d'un véhicule (plaque, marque, modèle, version, année, km) avec
 * leur validation. La plaque est mise en forme au blur ; un format hors SIV
 * n'empêche pas l'enregistrement (anciennes immatriculations, étranger).
 */

import { useRef } from 'react';
import { View, type TextInput } from 'react-native';

import { Champ } from '@/components/ui/champ';
import { PLAQUE_SIV, formaterPlaque } from '@/lib/format';

export type ValeursVehicule = { plaque: string; marque: string; modele: string; version: string; annee: string; km: string };

export const VEHICULE_VIDE: ValeursVehicule = { plaque: '', marque: '', modele: '', version: '', annee: '', km: '' };

export type ErreursVehicule = Partial<Record<keyof ValeursVehicule, string>>;

const ANNEE_MAX = new Date().getFullYear() + 1;

export function validerVehicule(v: ValeursVehicule): ErreursVehicule {
  const e: ErreursVehicule = {};
  if (!v.plaque.trim()) e.plaque = 'La plaque est nécessaire.';
  if (!v.marque.trim()) e.marque = 'La marque est nécessaire.';
  if (!v.modele.trim()) e.modele = 'Le modèle est nécessaire.';
  if (v.annee.trim()) {
    const n = Number(v.annee.replace(/\D/g, ''));
    if (!/^\d{4}$/.test(v.annee.trim()) || n < 1950 || n > ANNEE_MAX) e.annee = 'Année sur quatre chiffres.';
  }
  if (v.km.trim() && !/^[\d\s]+$/.test(v.km.trim())) e.km = 'Chiffres seulement.';
  return e;
}

/** Avertissement non bloquant sur le format de la plaque. */
export function avertissementPlaque(plaque: string): string | undefined {
  const p = formaterPlaque(plaque);
  if (!p || PLAQUE_SIV.test(p)) return undefined;
  return 'Format inhabituel (attendu AA-008-AA), enregistrée telle quelle.';
}

/** Valeurs prêtes pour le dépôt. */
export function versVehicule(v: ValeursVehicule): { plaque: string; marque: string; modele: string; version?: string; annee?: number; km?: number } {
  const annee = v.annee.replace(/\D/g, '');
  const km = v.km.replace(/\D/g, '');
  return {
    plaque: formaterPlaque(v.plaque),
    marque: v.marque.trim(),
    modele: v.modele.trim(),
    version: v.version.trim() || undefined,
    annee: annee ? Number(annee) : undefined,
    km: km ? Number(km) : undefined,
  };
}

type Props = {
  valeurs: ValeursVehicule;
  onChange: (v: ValeursVehicule) => void;
  erreurs: ErreursVehicule;
  autoFocus?: boolean;
  onSubmit?: () => void;
};

export function FormulaireVehicule({ valeurs, onChange, erreurs, autoFocus, onSubmit }: Props) {
  const maj = (patch: Partial<ValeursVehicule>) => onChange({ ...valeurs, ...patch });
  // Enchaînement au clavier : Plaque → Marque → Modèle → Version → Année → Kilométrage.
  const champMarque = useRef<TextInput>(null);
  const champModele = useRef<TextInput>(null);
  const champVersion = useRef<TextInput>(null);
  const champAnnee = useRef<TextInput>(null);
  const champKm = useRef<TextInput>(null);

  function saisirAnnee(annee: string) {
    maj({ annee });
    // Le pavé numérique n'a pas de touche Entrée : le quatrième chiffre passe au kilométrage.
    if (/^\d{4}$/.test(annee) && valeurs.annee.replace(/\D/g, '').length < 4) champKm.current?.focus();
  }

  return (
    <View>
      <Champ
        libelle="Plaque"
        type="plaque"
        value={valeurs.plaque}
        onChangeText={(plaque) => maj({ plaque })}
        onBlur={() => maj({ plaque: formaterPlaque(valeurs.plaque) })}
        erreur={erreurs.plaque}
        aide={avertissementPlaque(valeurs.plaque)}
        autoFocus={autoFocus}
        placeholder="AA-008-AA"
        maxLength={12}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => champMarque.current?.focus()}
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Champ
            ref={champMarque}
            libelle="Marque"
            value={valeurs.marque}
            onChangeText={(marque) => maj({ marque })}
            erreur={erreurs.marque}
            autoCapitalize="words"
            autoCorrect={false}
            placeholder="Peugeot"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => champModele.current?.focus()}
          />
        </View>
        <View className="flex-1">
          <Champ
            ref={champModele}
            libelle="Modèle"
            value={valeurs.modele}
            onChangeText={(modele) => maj({ modele })}
            erreur={erreurs.modele}
            autoCapitalize="words"
            autoCorrect={false}
            placeholder="208"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => champVersion.current?.focus()}
          />
        </View>
      </View>
      <Champ
        ref={champVersion}
        libelle="Version (facultatif)"
        value={valeurs.version}
        onChangeText={(version) => maj({ version })}
        placeholder="1.5 BlueHDi"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => champAnnee.current?.focus()}
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Champ
            ref={champAnnee}
            libelle="Année"
            type="nombre"
            value={valeurs.annee}
            onChangeText={saisirAnnee}
            erreur={erreurs.annee}
            placeholder="2019"
            maxLength={4}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => champKm.current?.focus()}
          />
        </View>
        <View className="flex-1">
          <Champ
            ref={champKm}
            libelle="Kilométrage"
            type="nombre"
            value={valeurs.km}
            onChangeText={(km) => maj({ km })}
            erreur={erreurs.km}
            placeholder="87 400"
            returnKeyType="done"
            onSubmitEditing={onSubmit}
          />
        </View>
      </View>
    </View>
  );
}
