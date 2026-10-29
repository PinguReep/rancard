/**
 * Lecteur de l'enregistrement d'un appel et fil des répliques, liés :
 * lecture et pause, recul et avance de 10 secondes, barre de position
 * (toucher pour s'y placer, réglable au VoiceOver), position et durée,
 * vitesse (1×, 1,5×, 2×). Pendant la lecture, la réplique en cours est
 * mise en évidence ; toucher une réplique place la lecture à son instant.
 *
 * Lecture en arrière-plan et sur l'écran verrouillé (expo-audio : mode
 * audio `shouldPlayInBackground`, `UIBackgroundModes: audio` posé par le
 * plugin, commandes de l'écran verrouillé), en mode silencieux aussi : le
 * geste est volontaire. Seul fichier qui importe expo-audio : la fiche ne
 * le charge que si le module natif est présent (EcouteAppel.tsx).
 */

import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Bouton, Carte, Erreur, Icone, Legende, Mono, impulsion, type NomIcone } from '@/components/ui';
import type { Replique, SourceAudio } from '@/domain/types';
import { useTheme } from '@/theme/tokens';

import { departDe, libelleVitesse, minutage, minutageParle, repliqueCourante, SAUT_S, vitesseSuivante, type Vitesse } from './ecoute';
import { FilAppel } from './FilAppel';

type Props = {
  source: SourceAudio;
  repliques: readonly Replique[];
  /** Prénom de l'appelant pour le fil */
  nomAppelant: string;
  /** Écran verrouillé : « Appel de Nicolas Fabre » */
  titre: string;
  /** Écran verrouillé : nom du garage */
  sousTitre: string;
  /** Durée connue de l'appel, en attendant celle du fichier */
  dureeAppel: number;
  /** Lecture impossible (URL échue, réseau) : la fiche redemande la conversation */
  onRecharger: () => void;
};

export function LecteurEtFil({ source, repliques, nomAppelant, titre, sousTitre, dureeAppel, onRecharger }: Props) {
  const t = useTheme();
  const lecteur = useAudioPlayer(source, { updateInterval: 250 });
  const etat = useAudioPlayerStatus(lecteur);
  const [vitesse, setVitesse] = useState<Vitesse>(1);
  // La lecture a commencé (ou une position a été choisie) : la réplique en cours se suit.
  const [engagee, setEngagee] = useState(false);
  const [echec, setEchec] = useState(false);
  const surEcranVerrouille = useRef(false);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => {
      // mode refusé : la lecture reste possible au premier plan
    });
  }, []);

  useEffect(() => {
    return () => {
      try {
        lecteur.clearLockScreenControls();
      } catch {
        // lecteur déjà libéré
      }
    };
  }, [lecteur]);

  const duree = etat.duration > 0 ? etat.duration : dureeAppel;
  const position = Math.max(0, duree > 0 ? Math.min(etat.currentTime, duree) : etat.currentTime);
  const fini = etat.didJustFinish || (etat.duration > 0 && etat.currentTime >= etat.duration - 0.05);
  const pret = etat.isLoaded;
  const enErreur = echec || Boolean(etat.error);

  const ecranVerrouille = () => {
    if (surEcranVerrouille.current) return;
    surEcranVerrouille.current = true;
    try {
      lecteur.setActiveForLockScreen(true, { title: titre, artist: sousTitre }, { showSeekBackward: true, showSeekForward: true });
    } catch {
      // commandes de l'écran verrouillé indisponibles : la lecture continue
    }
  };

  const placer = (secondes: number, puisLire: boolean) => {
    if (!Number.isFinite(secondes)) return;
    setEchec(false);
    setEngagee(true);
    const cible = Math.max(0, duree > 0 ? Math.min(secondes, duree) : secondes);
    if (puisLire) ecranVerrouille();
    lecteur
      .seekTo(cible)
      .then(() => {
        if (puisLire) lecteur.play();
      })
      .catch(() => setEchec(true));
  };

  const basculer = () => {
    impulsion('leger');
    if (etat.playing) {
      lecteur.pause();
      return;
    }
    if (fini) {
      placer(0, true);
      return;
    }
    setEchec(false);
    setEngagee(true);
    ecranVerrouille();
    lecteur.play();
  };

  const sauter = (delta: number) => {
    impulsion('leger');
    placer(position + delta, etat.playing);
  };

  const changerVitesse = () => {
    impulsion('leger');
    const v = vitesseSuivante(vitesse);
    setVitesse(v);
    lecteur.setPlaybackRate(v);
  };

  // Fil : rappel stable (les lignes sont mémoïsées), qui lit toujours l'état courant.
  const lireDepuis = useRef(placer);
  useEffect(() => {
    lireDepuis.current = placer;
  });
  const toucherReplique = useCallback((r: Replique) => {
    impulsion('leger');
    lireDepuis.current(departDe(r), true);
  }, []);

  const courante = engagee ? repliqueCourante(repliques, position) : -1;

  return (
    <View className="gap-3">
      <Carte className="gap-2 p-4">
        <BarrePosition
          position={position}
          duree={duree}
          actif={pret}
          onPlacer={(s) => placer(s, etat.playing)}
          onSauter={(d) => placer(position + d, etat.playing)}
        />
        {/* Position et durée (la barre les annonce déjà au VoiceOver), vitesse à droite. */}
        <View className="flex-row items-center justify-between">
          <Mono ton="muted" className="text-[13px]" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {pret ? `${minutage(position)} / ${minutage(duree)}` : 'Chargement…'}
          </Mono>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Vitesse de lecture, ${String(vitesse).replace('.', ',')} fois`}
            accessibilityHint="Passe à la vitesse suivante."
            onPress={changerVitesse}
            className="h-11 min-w-[56px] items-center justify-center rounded-full bg-surface2 px-3 active:opacity-70 dark:bg-surface2-dark">
            <Text maxFontSizeMultiplier={1.4} className="text-[15px] font-semibold text-ink dark:text-ink-dark">
              {libelleVitesse(vitesse)}
            </Text>
          </Pressable>
        </View>

        <View className="flex-row items-center justify-center gap-8">
          <BoutonTransport nom="reculer" label={`Reculer de ${SAUT_S} secondes`} actif={pret} onPress={() => sauter(-SAUT_S)} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={etat.playing ? 'Mettre en pause' : 'Écouter l’enregistrement'}
            accessibilityState={{ disabled: !pret, busy: etat.isBuffering && etat.playing }}
            disabled={!pret}
            onPress={basculer}
            className={`h-14 w-14 items-center justify-center rounded-full bg-accent dark:bg-accent-fond ${pret ? 'active:opacity-75' : 'opacity-50'}`}>
            {!pret || (etat.isBuffering && etat.playing) ? (
              <ActivityIndicator color={t.blanc} />
            ) : (
              <Icone nom={etat.playing ? 'pause' : 'lecture'} taille={24} couleur={t.blanc} poids="bold" />
            )}
          </Pressable>
          <BoutonTransport nom="avancer" label={`Avancer de ${SAUT_S} secondes`} actif={pret} onPress={() => sauter(SAUT_S)} />
        </View>

        {enErreur ? (
          <View className="mt-2 items-center gap-1">
            <Erreur className="text-center">Lecture impossible. Vérifiez la connexion, puis réessayez.</Erreur>
            <Bouton variante="discret" compact onPress={onRecharger}>
              Réessayer
            </Bouton>
          </View>
        ) : repliques.length ? (
          <Legende className="mt-1 text-center">Touchez une réplique pour l’écouter à ce moment-là.</Legende>
        ) : null}
      </Carte>

      <Carte className="px-1 py-2">
        <FilAppel repliques={repliques} nomAppelant={nomAppelant} courante={courante} onToucher={toucherReplique} />
      </Carte>
    </View>
  );
}

function BoutonTransport({ nom, label, actif, onPress }: { nom: NomIcone; label: string; actif: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !actif }}
      disabled={!actif}
      hitSlop={4}
      onPress={onPress}
      className={`h-11 w-11 items-center justify-center rounded-full border border-line bg-surface2 dark:border-line-dark dark:bg-surface2-dark ${
        actif ? 'active:opacity-70' : 'opacity-50'
      }`}>
      <Icone nom={nom} taille={20} couleur={t.ink} />
    </Pressable>
  );
}

/**
 * Barre de position : toucher pour s'y placer ; au VoiceOver, élément
 * réglable (balayer vers le haut ou le bas avance ou recule de 10 secondes).
 */
function BarrePosition({
  position,
  duree,
  actif,
  onPlacer,
  onSauter,
}: {
  position: number;
  duree: number;
  actif: boolean;
  onPlacer: (secondes: number) => void;
  onSauter: (delta: number) => void;
}) {
  const [largeur, setLargeur] = useState(0);
  const part = duree > 0 ? Math.min(1, position / duree) : 0;
  return (
    <Pressable
      accessibilityRole="adjustable"
      accessibilityLabel="Position dans l’enregistrement"
      aria-valuemin={0}
      aria-valuemax={Math.round(duree)}
      aria-valuenow={Math.round(position)}
      aria-valuetext={`${minutageParle(position)} sur ${minutageParle(duree)}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (!actif) return;
        onSauter(e.nativeEvent.actionName === 'increment' ? SAUT_S : -SAUT_S);
      }}
      disabled={!actif}
      onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
      onPress={(e) => {
        // iOS et Android : locationX ; web : événement DOM (offsetX, la piste occupe toute la largeur).
        const n = e.nativeEvent as { locationX?: number; offsetX?: number };
        const x = typeof n.locationX === 'number' ? n.locationX : n.offsetX;
        if (largeur > 0 && duree > 0 && typeof x === 'number' && Number.isFinite(x)) {
          onPlacer(Math.max(0, Math.min(1, x / largeur)) * duree);
        }
      }}
      className="h-11 justify-center">
      <View className="h-1.5 overflow-hidden rounded-full bg-surface2 dark:bg-surface2-dark">
        <View className="h-full rounded-full bg-accent dark:bg-accent-dark" style={{ width: `${part * 100}%` }} />
      </View>
    </Pressable>
  );
}
