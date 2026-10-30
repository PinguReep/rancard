/**
 * Activité du garage (depuis le profil, avec la permission « Voir
 * l’activité ») : trois chiffres sur la période, rien de plus. Rendez-vous
 * créés, véhicules livrés, et le montant livré (ou, sans accès aux prix,
 * les interventions bloquées en ce moment). Dessous, seulement si un client
 * a écrit depuis sa page de suivi (0020) : les messages reçus sur la
 * période et ceux qui attendent une réponse, un appui ouvre l’intervention.
 */

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { MessagesClients } from '@/components/activite/MessagesClients';
import { bornes, calculerStats, libellePeriode, PERIODES, type Periode } from '@/components/activite/stats';
import { Carte, Chiffre, Ecran, Legende, Titre, Vide } from '@/components/ui';
import { Segments } from '@/components/ui/segments';
import { messagesARepondre } from '@/domain/messages-clients';
import { euros } from '@/lib/format';
import { useDonnees, useMembre, usePermissions } from '@/state/session';

function Grand({ libelle, valeur, ton }: { libelle: string; valeur: string; ton?: 'warn' | 'ok' }) {
  return (
    <Carte className="px-5 py-5" accessible accessibilityLabel={`${libelle} : ${valeur}`}>
      <Legende className="text-[14px] font-medium">{libelle}</Legende>
      <Chiffre ton={ton ?? 'ink'} className="mt-1 text-[44px] leading-[50px]" numberOfLines={1} adjustsFontSizeToFit>
        {valeur}
      </Chiffre>
    </Carte>
  );
}

export default function Activite() {
  const router = useRouter();
  const membre = useMembre();
  const p = usePermissions();
  const garage = useDonnees((s) => s.garage);
  const interventions = useDonnees((s) => s.interventions);
  const evenements = useDonnees((s) => s.evenements);
  const appels = useDonnees((s) => s.appels);
  const membres = useDonnees((s) => s.membres);
  const clients = useDonnees((s) => s.clients);
  const vehicules = useDonnees((s) => s.vehicules);
  const commentaires = useDonnees((s) => s.commentaires);
  const messagesClients = useDonnees((s) => s.messagesClients);
  const [periode, setPeriode] = useState<Periode>('semaine');

  const stats = useMemo(() => {
    const visibles = p.voirTout ? interventions : interventions.filter((i) => i.membreId === membre.id);
    const equipe = (p.voirTout ? membres : membres.filter((m) => m.id === membre.id)).filter((m) => m.actif);
    return calculerStats({
      interventions: visibles,
      evenements,
      appels,
      membres: equipe,
      receptionniste: garage.options.receptionniste,
      periode,
    });
  }, [interventions, evenements, appels, membres, membre.id, p.voirTout, garage.options.receptionniste, periode]);

  // Messages des clients sur les fiches que le membre voit (un employé sans « voir tout » : les siennes).
  const messages = useMemo(() => {
    const visibles = new Set((p.voirTout ? interventions : interventions.filter((i) => i.membreId === membre.id)).map((i) => i.id));
    const siens = messagesClients.filter((m) => visibles.has(m.interventionId));
    const b = bornes(periode);
    const recus = siens.filter((m) => {
      const t = new Date(m.creeLe).getTime();
      return t >= b.de.getTime() && t <= b.a.getTime();
    }).length;
    return { recus, aRepondre: messagesARepondre(siens, commentaires, visibles) };
  }, [interventions, messagesClients, commentaires, membre.id, p.voirTout, periode]);

  if (!p.activite) {
    return (
      <Ecran sansHaut>
        <Vide icone="cadenas" titre="Accès réservé" texte="Demandez au gérant la permission « Voir l’activité »." />
      </Ecran>
    );
  }

  return (
    <Ecran sansHaut defilant>
      <View className="px-5 pb-4 pt-2">
        <Titre className="text-[34px] leading-[40px]">Activité</Titre>
        <Legende className="mt-1 text-[14px]">{libellePeriode(periode, bornes(periode))}</Legende>
      </View>
      <Segments options={PERIODES} valeur={periode} onChange={setPeriode} className="mx-4 mb-5" />
      <Animated.View entering={FadeIn.duration(240)} className="gap-2.5 px-4">
        <Grand libelle="Rendez-vous" valeur={String(stats.rendezVous)} />
        <Grand libelle="Véhicules livrés" valeur={String(stats.livres)} ton="ok" />
        {p.voirPrix ? (
          <Grand libelle="Montant livré" valeur={euros(stats.montantLivre) || '0 €'} />
        ) : (
          <Grand libelle="Bloquées en ce moment" valeur={String(stats.bloquees)} ton={stats.bloquees ? 'warn' : undefined} />
        )}
        <MessagesClients
          recus={messages.recus}
          aRepondre={messages.aRepondre}
          interventions={interventions}
          clients={clients}
          vehicules={vehicules}
          onOuvrir={(id) => router.push(`/intervention/${id}`)}
        />
      </Animated.View>
    </Ecran>
  );
}
