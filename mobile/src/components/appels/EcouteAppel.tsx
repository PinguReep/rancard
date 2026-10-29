/**
 * Conversation d'un appel sur sa fiche : lecteur de l'enregistrement et fil
 * des répliques (LecteurAppel.tsx), ou le fil seul, ou un état clair. Jamais
 * d'erreur bloquante : un appel sans conversation le dit simplement.
 *
 *   · réceptionniste non souscrit : « Non inclus dans l'offre de votre garage. » ;
 *   · rien de gardé (appel ancien, conversation échue) : phrase et durée de conservation ;
 *   · enregistrement en cours de récupération (juste après l'appel) : attente,
 *     redemandée toutes les 4 secondes pendant une minute ;
 *   · enregistrement indisponible : le fil seul ;
 *   · module audio absent (binaire plus ancien que le lecteur) : le fil seul
 *     et une invitation à mettre l'app à jour.
 *
 * La conversation est lue à l'ouverture de la fiche et à son retour au
 * premier plan, jamais gardée dans l'instantané. L'URL signée (15 minutes)
 * est gardée tant qu'elle est fraîche, pour ne pas couper une lecture.
 */

import { useFocusEffect } from 'expo-router';
import { requireOptionalNativeModule } from 'expo';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { Bouton, Carte, Legende, Secondaire } from '@/components/ui';
import { repo } from '@/data';
import { CONSERVATION_ECOUTE_JOURS } from '@/domain/appels';
import type { Appel, EcouteAppel as Ecoute } from '@/domain/types';
import { dateLongue, dePrenom } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

import { nomDansLeFil } from './ecoute';
import { FilAppel } from './FilAppel';
import type { LecteurEtFil as TypeLecteur } from './LecteurAppel';

/**
 * Le lecteur dépend du module natif expo-audio : un binaire qui ne l'a pas
 * (mise à jour JavaScript arrivée avant le nouveau build) garde le fil seul
 * au lieu de planter à l'import.
 */
const LECTEUR_DISPONIBLE = Platform.OS === 'web' || requireOptionalNativeModule('ExpoAudio') !== null;
const Lecteur: ComponentType<Parameters<typeof TypeLecteur>[0]> | null = LECTEUR_DISPONIBLE
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./LecteurAppel') as typeof import('./LecteurAppel')).LecteurEtFil
  : null;

const RELANCE_ATTENTE_MS = 4000;
const RELANCES_MAX = 15;
/** Une URL signée de 15 minutes est remplacée au-delà de 12 minutes. */
const URL_FRAICHE_MS = 12 * 60_000;

type Etat = { type: 'chargement' } | { type: 'erreur' } | { type: 'lu'; ecoute: Ecoute | null; luLe: number };

type Props = {
  appel: Appel;
  /** Nom du garage (écran verrouillé) */
  garage: string;
  /** Prestation réceptionniste souscrite par le garage */
  receptionnisteActif: boolean;
};

export function EcouteAppel({ appel, garage, receptionnisteActif }: Props) {
  const t = useTheme();
  const [etat, setEtat] = useState<Etat>({ type: 'chargement' });
  const [demande, setDemande] = useState(0);
  const relances = useRef(0);
  // Prochaine lecture : nouvelle URL même si l'actuelle est fraîche (lecture en échec).
  const forcer = useRef(false);
  const precedent = useRef<Etat>(etat);
  useEffect(() => {
    precedent.current = etat;
  }, [etat]);

  useFocusEffect(
    useCallback(() => {
      if (!receptionnisteActif) return undefined;
      let vivant = true;
      repo()
        .ecouteAppel(appel.id)
        .then((ecoute) => {
          if (!vivant) return;
          const avant = precedent.current;
          const garder =
            !forcer.current &&
            avant.type === 'lu' &&
            avant.ecoute?.audio.etat === 'pret' &&
            ecoute?.audio.etat === 'pret' &&
            Date.now() - avant.luLe < URL_FRAICHE_MS;
          forcer.current = false;
          if (garder && avant.type === 'lu' && avant.ecoute) {
            setEtat({ type: 'lu', ecoute: { ...ecoute, audio: avant.ecoute.audio }, luLe: avant.luLe });
          } else {
            setEtat({ type: 'lu', ecoute, luLe: Date.now() });
          }
        })
        .catch(() => {
          if (vivant && precedent.current.type !== 'lu') setEtat({ type: 'erreur' });
        });
      return () => {
        vivant = false;
      };
    }, [appel.id, receptionnisteActif, demande]),
  );

  // Enregistrement en cours de récupération : redemandé quelques fois.
  const enAttente = etat.type === 'lu' && etat.ecoute?.audio.etat === 'attente';
  useEffect(() => {
    if (!enAttente || relances.current >= RELANCES_MAX) return undefined;
    const minuteur = setTimeout(() => {
      relances.current += 1;
      setDemande((n) => n + 1);
    }, RELANCE_ATTENTE_MS);
    return () => {
      clearTimeout(minuteur);
    };
  }, [enAttente, demande]);

  const recharger = useCallback(() => {
    forcer.current = true;
    setDemande((n) => n + 1);
  }, []);

  if (!receptionnisteActif) {
    return (
      <Carte className="p-4">
        <Secondaire>Non inclus dans l’offre de votre garage.</Secondaire>
      </Carte>
    );
  }

  if (etat.type === 'chargement') {
    return (
      <Carte className="flex-row items-center gap-3 p-4">
        <ActivityIndicator color={t.muted} />
        <Secondaire>Chargement de la conversation…</Secondaire>
      </Carte>
    );
  }

  if (etat.type === 'erreur') {
    return (
      <Carte className="gap-2 p-4">
        <Secondaire>La conversation n’a pas pu être chargée.</Secondaire>
        <View className="self-start">
          <Bouton variante="discret" compact onPress={recharger}>
            Réessayer
          </Bouton>
        </View>
      </Carte>
    );
  }

  const { ecoute } = etat;
  if (!ecoute) {
    return (
      <Carte className="gap-1 p-4">
        <Secondaire>Pas d’enregistrement ni de transcription pour cet appel.</Secondaire>
        <Legende>Les conversations sont conservées {CONSERVATION_ECOUTE_JOURS} jours après l’appel, puis effacées.</Legende>
      </Carte>
    );
  }

  const nomAppelant = nomDansLeFil(appel.appelant);
  const conservation = (
    <Legende className="ml-1 mt-2">Conversation conservée jusqu’au {dateLongue(ecoute.conserveJusquAu)}, puis effacée.</Legende>
  );

  if (ecoute.audio.etat === 'pret' && Lecteur) {
    return (
      <View>
        <Lecteur
          source={ecoute.audio.source}
          repliques={ecoute.repliques}
          nomAppelant={nomAppelant}
          titre={appel.appelant ? `Appel ${dePrenom(appel.appelant)}` : 'Appel du réceptionniste'}
          sousTitre={garage}
          dureeAppel={appel.dureeSec}
          onRecharger={recharger}
        />
        {conservation}
      </View>
    );
  }

  const messageAudio =
    ecoute.audio.etat === 'attente' ? (
      <View className="flex-row items-center gap-3">
        <ActivityIndicator color={t.muted} />
        <Secondaire className="flex-1">Récupération de l’enregistrement…</Secondaire>
      </View>
    ) : ecoute.audio.etat === 'pret' ? (
      <Secondaire>Mettez l’app à jour pour écouter l’enregistrement.</Secondaire>
    ) : (
      <Secondaire>Pas d’enregistrement audio pour cet appel.</Secondaire>
    );

  return (
    <View className="gap-3">
      <Carte className="p-4">{messageAudio}</Carte>
      <Carte className="px-1 py-2">
        <FilAppel repliques={ecoute.repliques} nomAppelant={nomAppelant} />
      </Carte>
      {conservation}
    </View>
  );
}
