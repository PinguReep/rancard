/**
 * « Notifications sur ce téléphone » : état de la permission et geste
 * d'activation. Rien n'est demandé sans appui sur la ligne.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';

import { Legende, Ligne, Pastille, Texte, impulsion } from '@/components/ui';
import { enregistrerPushSiPossible, etatPermissionPush, type EtatPush } from '@/lib/push';
import { useTheme } from '@/theme/tokens';

type Etat = EtatPush | 'erreur' | 'inconnu';

export function LignePush({ membreId, derniere }: { membreId: string; derniere?: boolean }) {
  const t = useTheme();
  const [etat, setEtat] = useState<Etat>('inconnu');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let vivant = true;
    void etatPermissionPush().then((e) => {
      if (vivant) setEtat(e);
    });
    return () => {
      vivant = false;
    };
  }, []);

  async function activer() {
    if (enCours) return;
    if (etat === 'refusee') {
      try {
        await Linking.openSettings();
      } catch {
        // pas d'écran de réglages accessible : rien à faire
      }
      return;
    }
    setEnCours(true);
    const r = await enregistrerPushSiPossible(membreId);
    setEtat(r.etat);
    impulsion(r.etat === 'accordee' ? 'succes' : 'erreur');
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
