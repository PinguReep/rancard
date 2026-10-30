/**
 * Équipe (gérant) : membres actifs puis accès désactivés, et l'invitation
 * comme seule action principale, en bas. Avec le réceptionniste, chaque
 * membre qui reçoit les appels transférés sur son portable porte une
 * pastille (`transfertsEquipe`, 0019) : le gérant voit qui couvre les
 * appels, jamais le numéro.
 */

import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';

import { BarreAction } from '@/components/profil/BarreAction';
import { LigneMembre } from '@/components/profil/LigneMembre';
import { useMembreCourant } from '@/components/profil/useMembreCourant';
import { Bouton, Ecran, Groupe, Icone, Vide } from '@/components/ui';
import { repo } from '@/data';
import { estGerant } from '@/domain/permissions';
import type { Membre } from '@/domain/types';
import { useDonnees } from '@/state/session';
import { useTheme } from '@/theme/tokens';

function trier(a: Membre, b: Membre): number {
  if (a.role !== b.role) return a.role === 'gerant' ? -1 : 1;
  return `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, 'fr');
}

export default function Equipe() {
  const router = useRouter();
  const t = useTheme();
  const moi = useMembreCourant();
  const membres = useDonnees((s) => s.membres);
  const receptionniste = useDonnees((s) => s.garage.options.receptionniste === true);
  const gerant = estGerant(moi);
  const [portables, setPortables] = useState<Set<string>>(new Set());

  // Qui reçoit les appels transférés : relu à chaque retour sur l’écran (un membre a pu changer son réglage).
  useFocusEffect(
    useCallback(() => {
      if (!gerant || !receptionniste) return undefined;
      let actif = true;
      repo()
        .transfertsEquipe()
        .then(
          (ids) => {
            if (actif) setPortables(new Set(ids));
          },
          () => undefined,
        );
      return () => {
        actif = false;
      };
    }, [gerant, receptionniste]),
  );

  // Le titre ne compte que les membres qui ont un compte : les invitations
  // en attente restent listées, mais à part dans le compteur.
  const { actifs, inactifs, enAttente } = useMemo(
    () => ({
      actifs: membres.filter((m) => m.actif).sort(trier),
      inactifs: membres.filter((m) => !m.actif).sort(trier),
      enAttente: membres.filter((m) => m.actif && m.invitationEnAttente).length,
    }),
    [membres],
  );

  if (!estGerant(moi)) {
    return (
      <Ecran sansHaut>
        <Stack.Screen options={{ title: 'Équipe' }} />
        <Vide icone="cadenas" titre="Réservé au gérant" texte="Seul un gérant peut voir et modifier l’équipe." />
      </Ecran>
    );
  }

  const nbActifs = actifs.length - enAttente;
  const s = nbActifs > 1 ? 's' : '';
  const titreActifs = `${nbActifs} membre${s} actif${s}${enAttente ? ` · ${enAttente} invitation${enAttente > 1 ? 's' : ''} en attente` : ''}`;

  return (
    <Ecran sansHaut>
      <Stack.Screen options={{ title: 'Équipe' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} contentInsetAdjustmentBehavior="automatic">
        <Groupe
          titre={titreActifs}
          note={
            receptionniste
              ? '« Appels sur son portable » : reçoit les appels que le réceptionniste passe à l’équipe. Chacun l’active et choisit son numéro dans son profil.'
              : undefined
          }>
          {actifs.map((m, i) => (
            <LigneMembre
              key={m.id}
              membre={m}
              moi={m.id === moi.id}
              appelsPortable={receptionniste && portables.has(m.id)}
              onPress={() => router.push(`/profil/membre/${m.id}`)}
              derniere={i === actifs.length - 1}
            />
          ))}
        </Groupe>
        {inactifs.length ? (
          <Groupe titre="Accès désactivé" note="Ces membres ne peuvent plus se connecter. Leur fiche permet de rouvrir l’accès.">
            {inactifs.map((m, i) => (
              <LigneMembre key={m.id} membre={m} onPress={() => router.push(`/profil/membre/${m.id}`)} derniere={i === inactifs.length - 1} />
            ))}
          </Groupe>
        ) : null}
      </ScrollView>
      <BarreAction>
        <Bouton onPress={() => router.push('/profil/inviter')} icone={<Icone nom="plus" taille={18} couleur={t.blanc} poids="bold" />}>
          Inviter un membre
        </Bouton>
      </BarreAction>
    </Ecran>
  );
}
