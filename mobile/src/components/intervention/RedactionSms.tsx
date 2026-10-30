/**
 * Champ du SMS au client, avec « Rédiger avec l’IA » quand le garage a
 * activé la rédaction par l’IA (option `redactionIa`, Profil › Garage, 0021).
 *
 * Le texte proposé remplit le champ, rien de plus : la personne le relit,
 * le modifie et l’envoie elle-même par le bouton de la feuille, jamais
 * d’envoi automatique (AI Act 50(1) : relecture humaine réelle). Une mention
 * discrète le rappelle sous le champ. Pendant la rédaction, le champ attend
 * (il ne peut pas être écrasé sous les doigts) ; si elle échoue, le texte du
 * champ reste tel quel et une ligne le dit, sans alerte.
 *
 * Le parent remonte le composant (prop `key`) quand l’intention change :
 * la mention et l’état repartent de zéro avec le texte habituel.
 */

import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bouton, Champ, Icone, Legende, impulsion } from '@/components/ui';
import { repo } from '@/data';
import { type IntentionSms, MENTION_IA } from '@/lib/redaction';
import { useTheme } from '@/theme/tokens';

type Etat = 'repos' | 'ia' | 'repli' | 'plafond';

const LIGNES: Record<Exclude<Etat, 'repos'>, string> = {
  ia: MENTION_IA,
  repli: 'Rédaction indisponible pour le moment : le texte habituel est gardé.',
  plafond: 'Limite de rédactions du jour atteinte : le texte habituel est gardé.',
};

type Props = {
  interventionId: string;
  intention: IntentionSms;
  /** Ce que l’équipe veut dire (facultatif, sauf pour un message libre) */
  note?: string;
  texte: string;
  onTexte: (texte: string) => void;
  /** Ligne d’aide sous le champ (« Le lien de suivi est ajouté à la fin. ») */
  aide?: string;
  /** Destinataire, pour les libellés d’accessibilité (« Hugo Bertin ») */
  qui: string;
};

export function RedactionSms({ interventionId, intention, note, texte, onTexte, aide, qui }: Props) {
  const t = useTheme();
  const [etat, setEtat] = useState<Etat>('repos');
  const [enCours, setEnCours] = useState(false);
  const sansNote = intention === 'libre' && !note?.trim();
  const ligne = enCours ? 'Rédaction en cours…' : etat === 'repos' ? aide : LIGNES[etat];

  async function rediger() {
    setEnCours(true);
    try {
      const r = await repo().redigerSms(interventionId, intention, note);
      if (r.ia && r.texte) {
        onTexte(r.texte);
        setEtat('ia');
        impulsion('succes');
      } else {
        setEtat(r.raison === 'plafond' ? 'plafond' : 'repli');
      }
    } catch {
      // Option retirée entre-temps, réseau : le texte du champ reste, la ligne le dit.
      setEtat('repli');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <View>
      <Champ
        libelle="Message"
        type="multiligne"
        value={texte}
        onChangeText={onTexte}
        editable={!enCours}
        accessibilityLabel={`Texte du SMS à ${qui}`}
        accessibilityHint={etat === 'ia' ? MENTION_IA : undefined}
        className="mb-0"
        // Un SMS entier (160 caractères) se lit sans défiler.
        style={{ minHeight: 132 }}
        maxLength={640}
      />
      {ligne ? (
        <Legende ton={etat === 'ia' && !enCours ? 'accent' : 'muted'} className="ml-1 mt-1.5" accessibilityLiveRegion="polite">
          {ligne}
        </Legende>
      ) : null}
      {aide && (enCours || etat !== 'repos') ? <Legende className="ml-1 mt-0.5">{aide}</Legende> : null}
      <View className="mt-2.5">
        <Bouton
          variante="secondaire"
          onPress={rediger}
          chargement={enCours}
          desactive={sansNote}
          icone={<Icone nom="redaction" taille={18} couleur={t.accent} />}
          accessibilityLabel={
            sansNote
              ? 'Rédiger avec l’IA : écrivez d’abord ce que vous voulez dire'
              : etat === 'ia'
                ? 'Proposer un autre texte avec l’IA'
                : `Rédiger le SMS à ${qui} avec l’IA`
          }>
          {etat === 'ia' ? 'Autre proposition' : 'Rédiger avec l’IA'}
        </Bouton>
      </View>
    </View>
  );
}

/**
 * Contenu de feuille qui reste au-dessus du clavier (le champ du SMS se
 * saisit au bas de l’écran), défilant si la feuille est trop haute.
 */
export function AuDessusDuClavier({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height: clavier } = useReanimatedKeyboardAnimation();
  const style = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, -clavier.value - insets.bottom) }));
  return (
    <Animated.View style={style} className="shrink">
      <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
        {children}
      </ScrollView>
    </Animated.View>
  );
}
