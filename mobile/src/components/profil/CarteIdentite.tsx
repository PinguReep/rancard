/**
 * Carte d'identité d'un membre : avatar, nom, rôle · poste, e-mail, et
 * l'état d'accès s'il n'est pas ordinaire.
 */

import { View } from 'react-native';

import { Avatar, Carte, Legende, Pastille, Secondaire, SousTitre } from '@/components/ui';
import { POSTES, ROLES } from '@/domain/permissions';
import type { Membre } from '@/domain/types';

export function CarteIdentite({ membre, className = '' }: { membre: Membre; className?: string }) {
  return (
    <Carte className={`flex-row items-center gap-4 p-4 ${className}`}>
      <Avatar membre={membre} taille={56} />
      <View className="flex-1">
        <SousTitre numberOfLines={1}>
          {membre.prenom} {membre.nom}
        </SousTitre>
        <Secondaire numberOfLines={1}>
          {ROLES[membre.role].label} · {POSTES[membre.poste].label}
        </Secondaire>
        <Legende numberOfLines={1} className="mt-0.5">
          {membre.email}
        </Legende>
        {membre.invitationEnAttente ? (
          <View className="mt-2">
            <Pastille label="Invitation en attente" ton="warn" />
          </View>
        ) : !membre.actif ? (
          <View className="mt-2">
            <Pastille label="Accès désactivé" ton="muted" />
          </View>
        ) : null}
      </View>
    </Carte>
  );
}
