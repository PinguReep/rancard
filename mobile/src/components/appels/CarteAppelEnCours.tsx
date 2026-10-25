/**
 * Appel en cours avec le réceptionniste : carte verte, point qui pulse,
 * durée qui défile, et la fiche qui se remplit en direct à mesure que
 * l'appelant confirme ses informations (outil update_call_context de
 * l'agent, via Realtime). Pas d'action : l'appelant est en ligne avec le
 * réceptionniste ; le rappel et la fiche à valider viennent à la fin de
 * l'appel. Texte affiché tel quel : il est dicté par l'appelant.
 */

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Plaque } from '@/components/ui/plaque';
import { Etiquette, Legende, Secondaire, Texte } from '@/components/ui/texte';
import { LIBELLES_ETAPE } from '@/domain/appels';
import type { Appel, ChampContexte } from '@/domain/types';
import { dureeSecondes, formaterPlaque, formaterTelephone, ilYA, kilometrage } from '@/lib/format';

const secondesDepuis = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));

/** Une information de la fiche : libellé, valeur, et « à confirmer » si l'appelant ne l'a pas encore validée. */
function Info({ libelle, champ, valeur }: { libelle: string; champ?: ChampContexte; valeur?: string }) {
  if (!valeur) return null;
  return (
    <View accessible accessibilityLabel={`${libelle} : ${valeur}${champ && !champ.confirme ? ', à confirmer' : ''}`}>
      <Legende>{libelle}</Legende>
      <View className="mt-0.5 flex-row flex-wrap items-baseline gap-x-2">
        <Texte selectable>{valeur}</Texte>
        {champ && !champ.confirme ? <Legende ton="warn">à confirmer</Legende> : null}
      </View>
    </View>
  );
}

export function CarteAppelEnCours({ appel }: { appel: Appel }) {
  // Halo qui respire autour du point vert.
  const souffle = useSharedValue(1);
  useEffect(() => {
    souffle.value = withRepeat(withTiming(0.2, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(souffle);
  }, [souffle]);
  const halo = useAnimatedStyle(() => ({
    opacity: souffle.value * 0.6,
    transform: [{ scale: 2.4 - souffle.value * 1.2 }],
  }));

  // Durée écoulée depuis le début de l'appel (rafraîchit aussi « mis à jour il y a… »).
  const [ecoule, setEcoule] = useState(() => secondesDepuis(appel.debut));
  useEffect(() => {
    const id = setInterval(() => setEcoule(secondesDepuis(appel.debut)), 1000);
    return () => clearInterval(id);
  }, [appel.debut]);

  const c = appel.contexte?.champs ?? {};
  const nomDicte = [c.prenom?.valeur, c.nom?.valeur].filter(Boolean).join(' ');
  const numero = appel.numero ? formaterTelephone(appel.numero) : '';
  const titre = appel.appelant || nomDicte || numero || 'Numéro masqué';
  const sousTitre = titre !== numero ? numero : '';
  // Le numéro de rappel n'est repris que s'il diffère de celui qui appelle.
  const rappelDicte = c.telephoneRappel ? formaterTelephone(c.telephoneRappel.valeur) : '';
  const rappel = rappelDicte !== numero ? rappelDicte : '';
  const vehicule = [c.marque?.valeur, c.modele?.valeur].filter(Boolean).join(' ');
  const vehiculeConfirme = [c.marque, c.modele].every((x) => !x || x.confirme);
  const plaque = c.immatriculation ? formaterPlaque(c.immatriculation.valeur) : '';
  const km = c.kilometrage ? kilometrage(Number(c.kilometrage.valeur)) : '';
  const etape = appel.contexte?.etape;
  const rien = !rappel && !vehicule && !plaque && !km && !c.motif;

  return (
    <Animated.View
      entering={FadeIn.duration(240)}
      accessibilityLabel={`Appel en cours, ${titre}, ${dureeSecondes(ecoule)}`}
      className="mx-4 mb-6 rounded-2xl border border-ok bg-ok-soft p-4 dark:border-ok-dark dark:bg-ok-softdark">
      <View className="flex-row items-center gap-2.5">
        <View className="h-3 w-3 items-center justify-center">
          <Animated.View className="absolute h-3 w-3 rounded-full bg-ok dark:bg-ok-dark" style={halo} />
          <View className="h-2.5 w-2.5 rounded-full bg-ok dark:bg-ok-dark" />
        </View>
        <Etiquette ton="ok">Appel en cours</Etiquette>
        <Legende ton="ok" className="ml-auto font-mono">
          {dureeSecondes(ecoule)}
        </Legende>
      </View>

      <Texte className="mt-3 font-semibold" numberOfLines={1}>
        {titre}
      </Texte>
      {sousTitre ? <Legende>{sousTitre}</Legende> : null}
      {etape ? (
        <Legende ton="ok" className="mt-1">
          {`Étape : ${LIBELLES_ETAPE[etape]}`}
        </Legende>
      ) : null}

      <Etiquette className="mt-4">Fiche en direct</Etiquette>
      {rien ? (
        <Secondaire className="mt-1">
          Le réceptionniste est en ligne. Les informations confirmées par l’appelant s’affichent ici au fil de l’appel.
        </Secondaire>
      ) : (
        <View className="mt-2 gap-3">
          <Info libelle="Numéro de rappel" champ={c.telephoneRappel} valeur={rappel} />
          <Info
            libelle="Véhicule"
            champ={vehicule ? { valeur: vehicule, confirme: vehiculeConfirme } : undefined}
            valeur={vehicule}
          />
          {plaque ? (
            <View
              accessible
              accessibilityLabel={`Immatriculation : ${plaque.split('').join(' ')}${c.immatriculation?.confirme ? '' : ', à confirmer'}`}>
              <Legende>Immatriculation</Legende>
              <View className="mt-1 flex-row items-center gap-2">
                <Plaque plaque={plaque} />
                {c.immatriculation?.confirme ? null : <Legende ton="warn">à confirmer</Legende>}
              </View>
            </View>
          ) : null}
          <Info libelle="Kilométrage" champ={c.kilometrage} valeur={km} />
          <Info libelle="Motif" champ={c.motif} valeur={c.motif?.valeur} />
        </View>
      )}
      {appel.contexte?.majLe ? (
        <Legende className="mt-4">{`Mis à jour ${ilYA(appel.contexte.majLe)}`}</Legende>
      ) : null}
    </Animated.View>
  );
}
