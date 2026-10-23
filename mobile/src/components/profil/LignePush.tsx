/**
 * « Notifications sur ce téléphone » : état de la permission et geste
 * d'activation. Rien n'est demandé sans appui sur la ligne.
 *
 * L'état est relu à chaque retour au premier plan : après une autorisation
 * dans les réglages du téléphone, la ligne passe à « Activées » et le jeton
 * de l'appareil est enregistré sans nouvelle demande.
 */

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, View } from 'react-native';

import { Legende, Ligne, Pastille, Texte, impulsion } from '@/components/ui';
import { enregistrerPushSiPossible, etatPermissionPush, type EtatPush } from '@/lib/push';
import { useTheme } from '@/theme/tokens';

type Etat = EtatPush | 'erreur' | 'inconnu';

export function LignePush({ membreId, derniere }: { membreId: string; derniere?: boolean }) {
  const t = useTheme();
  const [etat, setEtat] = useState<Etat>('inconnu');
  const [enCours, setEnCours] = useState(false);
  // Copies lues par l'écouteur AppState, qui ne voit pas les rendus suivants.
  const etatRef = useRef<Etat>('inconnu');
  const enCoursRef = useRef(false);

  useEffect(() => {
    let vivant = true;

    async function relire(auRetour: boolean) {
      // Pendant une activation, la demande système fait passer l'app en arrière-plan : on ne relit pas.
      if (enCoursRef.current) return;
      const e = await etatPermissionPush();
      if (!vivant || enCoursRef.current) return;
      const avant = etatRef.current;
      if (auRetour && e === 'accordee' && avant !== 'accordee' && avant !== 'inconnu') {
        // Autorisées dans les réglages : le jeton s'enregistre, sans nouvelle demande.
        enCoursRef.current = true;
        setEnCours(true);
        const r = await enregistrerPushSiPossible(membreId);
        enCoursRef.current = false;
        if (!vivant) return;
        etatRef.current = r.etat;
        setEtat(r.etat);
        setEnCours(false);
        return;
      }
      etatRef.current = e;
      setEtat(e);
    }

    void relire(false);
    const abonnement = AppState.addEventListener('change', (s) => {
      if (s === 'active') void relire(true);
    });
    return () => {
      vivant = false;
      abonnement.remove();
    };
  }, [membreId]);

  async function activer() {
    if (enCoursRef.current) return;
    if (etat === 'refusee') {
      try {
        await Linking.openSettings();
      } catch {
        // pas d'écran de réglages accessible : rien à faire
      }
      return;
    }
    enCoursRef.current = true;
    setEnCours(true);
    const r = await enregistrerPushSiPossible(membreId);
    etatRef.current = r.etat;
    setEtat(r.etat);
    impulsion(r.etat === 'accordee' ? 'succes' : 'erreur');
    enCoursRef.current = false;
    setEnCours(false);
  }

  const appuyable = etat === 'a_demander' || etat === 'refusee' || etat === 'erreur';

  const aide: Partial<Record<Etat, string>> = {
    a_demander: 'Pour être prévenu des rendez-vous, des fiches à valider et des accords clients.',
    refusee: 'Refusées pour l’instant. Autorisez-les dans les réglages du téléphone.',
    erreur: 'L’activation n’a pas abouti. Réessayez avec du réseau.',
    indisponible: Platform.OS === 'web' ? 'Indisponibles dans le navigateur.' : 'Indisponibles sur cet appareil.',
    accordee: 'Vous recevez les alertes du garage sur ce téléphone.',
  };

  return (
    <Ligne onPress={appuyable ? activer : undefined} derniere={derniere} accessibilityLabel="Notifications sur ce téléphone">
      <View className="flex-1">
        <Texte>Notifications sur ce téléphone</Texte>
        {aide[etat] ? <Legende className="mt-0.5">{aide[etat]}</Legende> : null}
      </View>
      {enCours ? (
        <ActivityIndicator color={t.muted} />
      ) : etat === 'accordee' ? (
        <Pastille label="Activées" ton="ok" point />
      ) : appuyable ? (
        <Texte ton="accent" className="font-semibold">
          {etat === 'refusee' ? 'Réglages' : 'Activer'}
        </Texte>
      ) : etat === 'inconnu' ? null : (
        <Pastille label="Indisponibles" ton="muted" />
      )}
    </Ligne>
  );
}
