/**
 * Kilométrage au dépôt (D7) : le compteur relevé quand la voiture arrive,
 * propre à cette intervention. Le champ reprend le relevé de
 * l’intervention s’il existe ; sinon il est prérempli avec le dernier
 * relevé du véhicule, dont la légende rappelle la date pour inviter à lire
 * le compteur (décision de Camille). Jamais obligatoire ;
 * « Retirer le relevé » l’efface. Le véhicule prend ce kilométrage s’il dépasse son dernier
 * relevé (le serveur s’en charge, la démo à l’identique).
 */

import { useEffect, useRef, useState } from 'react';
import { ScrollView, View, type TextInput } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bouton, Champ, Feuille, impulsion } from '@/components/ui';
import { repo } from '@/data';
import { aideReleveRepris, dernierReleve } from '@/domain/echeances';
import { REFUS } from '@/domain/journal';
import { KM_MAX } from '@/domain/statuts';
import type { Client, Intervention, Vehicule } from '@/domain/types';
import { chiffresKm, kilometrage, nomClient, titreVoiture, voitureEtPlaque } from '@/lib/format';
import { useDonnees } from '@/state/session';

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  intervention: Intervention;
  client?: Client;
  vehicule?: Vehicule;
  /** Avis de fin (« Kilométrage enregistré · … ») */
  onAvis: (texte: string) => void;
};

/** « 113 450 » pendant la saisie : chiffres groupés par milliers. */
const enMilliers = (n: number) => n.toLocaleString('fr-FR');

export function FeuilleKilometrage({ ouverte, onFermer, intervention: i, client, vehicule, onAvis }: Props) {
  const insets = useSafeAreaInsets();
  const champ = useRef<TextInput>(null);
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const interventions = useDonnees((s) => s.interventions);
  const releve = dernierReleve(vehicule, interventions, i.id);

  // À chaque ouverture : le relevé de l’intervention, sinon le dernier du véhicule (D7, prérempli).
  useEffect(() => {
    if (!ouverte) return;
    const depart = i.kmDepot ?? releve?.km;
    setSaisie(depart != null ? enMilliers(depart) : '');
    setErreur(null);
    // Seule l’ouverture réinitialise la saisie.
  }, [ouverte]);

  // Le pavé numérique ne masque pas le bouton.
  const { height: clavier } = useReanimatedKeyboardAnimation();
  const sousClavier = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, -clavier.value - insets.bottom) }));

  const km = chiffresKm(saisie);
  const valide = km != null && km <= KM_MAX;

  async function ecrire(valeur: number | null) {
    setOccupe(true);
    setErreur(null);
    try {
      await repo().modifierIntervention(i.id, { kmDepot: valeur });
      impulsion('succes');
      onFermer();
      onAvis(`${valeur == null ? 'Relevé retiré' : 'Kilométrage enregistré'} · ${voitureEtPlaque(vehicule)}`);
    } catch (e) {
      impulsion('erreur');
      setErreur((e as Error).message || 'Le kilométrage n’a pas pu être enregistré.');
    } finally {
      setOccupe(false);
    }
  }

  function enregistrer() {
    if (km == null) {
      champ.current?.focus();
      return;
    }
    if (!valide) {
      setErreur(REFUS.R14);
      return;
    }
    // Rien de changé : la feuille se ferme sans écriture.
    if (km === i.kmDepot) {
      onFermer();
      return;
    }
    void ecrire(km);
  }

  const legende = [titreVoiture(vehicule), client ? nomClient(client) : null].filter(Boolean).join(' · ');
  // Relevé repris tel quel : la légende en donne la date, pour qu’on lise le compteur.
  const repris = i.kmDepot == null && releve != null && km === releve.km;
  const aide = repris
    ? aideReleveRepris(releve.le)
    : vehicule?.km != null
      ? `Dernier relevé : ${kilometrage(vehicule.km)}`
      : 'Aucun relevé pour ce véhicule.';

  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre="Kilométrage au dépôt" legende={legende}>
      <Animated.View style={sousClavier} className="shrink">
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Champ
            ref={champ}
            type="nombre"
            className="mb-5"
            value={saisie}
            onChangeText={(t) => {
              const n = chiffresKm(t);
              setSaisie(n != null ? enMilliers(n) : '');
              setErreur(null);
            }}
            maxLength={9}
            placeholder={vehicule?.km != null ? `Dernier : ${kilometrage(vehicule.km)}` : 'Ex. 113 450'}
            accessibilityLabel="Kilométrage au compteur, en kilomètres"
            returnKeyType="done"
            onSubmitEditing={enregistrer}
            erreur={erreur}
            aide={aide}
          />
          <View className="gap-2">
            <Bouton
              onPress={enregistrer}
              chargement={occupe}
              desactive={km == null}
              accessibilityLabel={km != null ? `Enregistrer ${enMilliers(km)} kilomètres` : 'Enregistrer'}>
              {km != null ? `Enregistrer · ${kilometrage(km)}` : 'Enregistrer'}
            </Bouton>
            {i.kmDepot != null ? (
              <Bouton variante="discret" onPress={() => ecrire(null)} desactive={occupe}>
                Retirer le relevé
              </Bouton>
            ) : null}
          </View>
        </ScrollView>
      </Animated.View>
    </Feuille>
  );
}
