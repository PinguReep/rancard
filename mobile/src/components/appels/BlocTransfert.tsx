/**
 * Passage à l'équipe, dans la carte de l'appel en direct : les téléphones
 * sonnent (avec « Décrocher » si ce téléphone sonne aussi), un membre est en
 * ligne (avec « Revenir à l'appel » si c'est sur ce téléphone), ou le passage
 * a échoué et le réceptionniste reste en ligne. En démonstration, un bouton
 * simule le passage d'un appel en cours, seulement dans un binaire avec la
 * sonnerie (`sonnerieSimulee`, « Rencar Test ») : sans elle, la carte ne
 * montre que ce que le serveur rapporte.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Bouton } from '@/components/ui/bouton';
import { Erreur, Etiquette, Legende, Secondaire } from '@/components/ui/texte';
import { LIBELLES_TRANSFERT } from '@/domain/appels';
import type { Appel } from '@/domain/types';
import { decrocher, simulerPassageEquipe, sonnerieSimulee, useTelephone } from '@/lib/sonnerie';
import { useDonnees, useMembre } from '@/state/session';

export function BlocTransfert({ appel }: { appel: Appel }) {
  const router = useRouter();
  const moi = useMembre();
  const membres = useDonnees((s) => s.membres);
  const sonneIci = useTelephone((s) => s.entrant?.appelId === appel.id);
  const enLigneIci = useTelephone((s) => s.actif?.appelId === appel.id);
  const recoit = useTelephone((s) => s.inscription === 'active');
  const [erreur, setErreur] = useState<string | null>(null);
  const t = appel.transfert;

  const tenter = async (f: () => Promise<void>) => {
    setErreur(null);
    try {
      await f();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Action impossible pour le moment.');
    }
  };

  if (!t) {
    if (!sonnerieSimulee() || !appel.enCours) return null;
    return (
      <View className="mt-4">
        <Bouton variante="secondaire" compact onPress={() => tenter(() => simulerPassageEquipe(appel))}>
          Simuler le passage à l’équipe
        </Bouton>
        <Legende className="mt-1.5">
          {recoit
            ? 'Démonstration : le réceptionniste passe cet appel à l’équipe et ce téléphone sonne.'
            : 'Démonstration : activez « Recevoir les appels » dans le profil pour que ce téléphone sonne.'}
        </Legende>
      </View>
    );
  }

  if (t.etat === 'sonne') {
    return (
      <View className="mt-4" accessibilityLiveRegion="polite">
        <Etiquette ton="accent">{LIBELLES_TRANSFERT.sonne}</Etiquette>
        <Secondaire className="mt-1">Les téléphones de l’équipe sonnent : le premier qui décroche parle au client.</Secondaire>
        {sonneIci ? (
          <Bouton className="mt-3" onPress={() => tenter(decrocher)} accessibilityLabel="Décrocher cet appel sur ce téléphone">
            Décrocher
          </Bouton>
        ) : null}
        {erreur ? <Erreur className="mt-2">{erreur}</Erreur> : null}
      </View>
    );
  }

  if (t.etat === 'en_ligne') {
    const qui = t.prisPar === moi.id ? 'vous' : (membres.find((m) => m.id === t.prisPar)?.prenom ?? 'l’équipe');
    return (
      <View className="mt-4" accessibilityLiveRegion="polite">
        <Etiquette ton="ok">{`En ligne avec ${qui}`}</Etiquette>
        <Secondaire className="mt-1">Le réceptionniste a passé la main. Sa fiche reste ci-dessous.</Secondaire>
        {enLigneIci ? (
          <Bouton className="mt-3" onPress={() => router.push('/ecran-appel')}>
            Revenir à l’appel
          </Bouton>
        ) : null}
      </View>
    );
  }

  if (t.etat === 'echec') {
    return (
      <Legende ton="warn" className="mt-4">
        {`${LIBELLES_TRANSFERT.echec} : le réceptionniste reste en ligne et note un rappel.`}
      </Legende>
    );
  }
  return null;
}
