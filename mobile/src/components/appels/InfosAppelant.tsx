/**
 * Ce que l'appelant a donné au réceptionniste, une information par ligne :
 * libellé, valeur dictée telle quelle, et « à confirmer » si l'appelant ne
 * l'a pas validée. Rien n'est affiché pour un champ manquant. Partagé par
 * la carte de l'appel en direct et la fiche de l'appel.
 */

import { Pressable, View } from 'react-native';

import { Plaque } from '@/components/ui/plaque';
import { Legende, Texte } from '@/components/ui/texte';

import type { DonneesAppelant, InfoAppelant } from './donnees-appelant';

const A_CONFIRMER = 'à confirmer';

/** Une ligne : libellé, valeur, « à confirmer ». Avec onPress, la valeur est un lien (numéro à appeler). */
function Info({ libelle, info, onPress }: { libelle: string; info?: InfoAppelant; onPress?: () => void }) {
  if (!info) return null;
  const label = `${libelle} : ${info.texte}${info.confirme ? '' : `, ${A_CONFIRMER}`}`;
  const contenu = (
    <>
      <Legende>{libelle}</Legende>
      <View className="mt-0.5 flex-row flex-wrap items-baseline gap-x-2">
        <Texte selectable={!onPress} ton={onPress ? 'accent' : 'ink'}>
          {info.texte}
        </Texte>
        {info.confirme ? null : <Legende ton="warn">{A_CONFIRMER}</Legende>}
      </View>
    </>
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${label}. Appeler ce numéro`}
        onPress={onPress}
        className="min-h-[44px] justify-center self-start active:opacity-70">
        {contenu}
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityLabel={label}>
      {contenu}
    </View>
  );
}

/** Au moins une information à montrer (le nom compte seulement s'il est affiché). */
export function aDesInfos(d: DonneesAppelant, avecIdentite = false): boolean {
  return Boolean((avecIdentite && d.identite) || d.rappel || d.vehicule || d.plaque || d.km || d.motif);
}

type Props = {
  donnees: DonneesAppelant;
  /** Afficher aussi le nom dicté (la carte en direct le porte déjà en titre) */
  avecIdentite?: boolean;
  /** Numéro de rappel en lien : appelle ce numéro (fiche de l'appel ; pas pendant l'appel) */
  onAppelerRappel?: (numero: string) => void;
  className?: string;
};

export function InfosAppelant({ donnees: d, avecIdentite, onAppelerRappel, className = '' }: Props) {
  if (!aDesInfos(d, avecIdentite)) return null;
  return (
    <View className={`gap-3 ${className}`}>
      {avecIdentite ? <Info libelle="Nom" info={d.identite} /> : null}
      <Info
        libelle="Numéro de rappel"
        info={d.rappel}
        onPress={d.rappel && onAppelerRappel ? () => onAppelerRappel(d.rappel!.texte) : undefined}
      />
      <Info libelle="Véhicule" info={d.vehicule} />
      {d.plaque ? (
        <View
          accessible
          accessibilityLabel={`Immatriculation : ${d.plaque.texte.split('').join(' ')}${d.plaque.confirme ? '' : `, ${A_CONFIRMER}`}`}>
          <Legende>Immatriculation</Legende>
          <View className="mt-1 flex-row items-center gap-2">
            <Plaque plaque={d.plaque.texte} />
            {d.plaque.confirme ? null : <Legende ton="warn">{A_CONFIRMER}</Legende>}
          </View>
        </View>
      ) : null}
      <Info libelle="Kilométrage" info={d.km} />
      <Info libelle="Motif" info={d.motif} />
    </View>
  );
}
