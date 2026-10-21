/**
 * Haut de la fiche : prestation, statut, client (téléphone, SMS), véhicule.
 */

import { useRouter } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';

import {
  Bouton,
  Groupe,
  Icone,
  Legende,
  Ligne,
  Mono,
  Pastille,
  PastilleBlocage,
  PastilleOrigine,
  PastilleStatut,
  Texte,
  Titre,
  impulsion,
} from '@/components/ui';
import { ORIGINES, estBloquee } from '@/domain/statuts';
import type { Client, Intervention, Vehicule } from '@/domain/types';
import { formaterTelephone, ilYA, kilometrage, telHref } from '@/lib/format';
import { smsHref } from '@/lib/suivi';
import { useTheme } from '@/theme/tokens';

type Props = {
  intervention: Intervention;
  client?: Client;
  vehicule?: Vehicule;
  /** Option SMS du garage */
  sms: boolean;
};

/** « il y a 2 h » reste tel quel, une date devient « le 12/02/2026 ». */
const depuis = (iso: string) => {
  const s = ilYA(iso);
  return /^\d/.test(s) ? `le ${s}` : s;
};

export function EnTeteFiche({ intervention: i, client, vehicule, sms }: Props) {
  const router = useRouter();
  const t = useTheme();
  const nom = client ? `${client.prenom} ${client.nom}` : 'Client inconnu';
  const detailsVehicule = vehicule ? [vehicule.version, vehicule.annee].filter(Boolean).join(' · ') : '';

  return (
    <View>
      <View className="pt-3">
        <Titre>{i.prestation}</Titre>
        <View className="mt-2.5 flex-row flex-wrap items-center gap-1.5">
          <PastilleStatut statut={i.statut} />
          {estBloquee(i) && i.blocage ? <PastilleBlocage blocage={i.blocage} /> : null}
          {i.prioritaire ? <Pastille label="Prioritaire" ton="danger" point /> : null}
          <PastilleOrigine origine={i.origine} />
        </View>
        <Legende className="mt-2">
          Créée {depuis(i.creeLe)} · {ORIGINES[i.origine].label} · mise à jour {depuis(i.majLe)}
        </Legende>
      </View>

      <Groupe className="mt-5">
        <Ligne onPress={client ? () => router.push(`/client/${client.id}`) : undefined} accessibilityLabel={`Ouvrir la fiche de ${nom}`}>
          <Icone nom="clients" taille={18} couleur={t.muted} />
          <View className="flex-1">
            <Texte className="font-semibold">{nom}</Texte>
            {client?.memo ? <Legende numberOfLines={1}>{client.memo}</Legende> : null}
          </View>
          {client ? <Icone nom="chevron.droite" taille={16} couleur={t.faint} /> : null}
        </Ligne>
        {client ? (
          <Ligne>
            <Icone nom="telephone" taille={18} couleur={t.muted} />
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Appeler ${nom} au ${formaterTelephone(client.telephone)}`}
              onPress={() => {
                impulsion('leger');
                void Linking.openURL(telHref(client.telephone));
              }}
              className="min-h-[44px] flex-1 justify-center active:opacity-70">
              <Texte ton="accent">{formaterTelephone(client.telephone)}</Texte>
            </Pressable>
            {sms ? (
              <Bouton
                compact
                variante="secondaire"
                icone={<Icone nom="message" taille={16} />}
                accessibilityLabel={`Envoyer un SMS à ${nom}`}
                onPress={() => Linking.openURL(smsHref(client.telephone))}>
                SMS
              </Bouton>
            ) : null}
          </Ligne>
        ) : null}
        <Ligne derniere>
          <Icone nom="voiture" taille={18} couleur={t.muted} />
          <View className="flex-1">
            <Texte className="font-semibold">{vehicule ? `${vehicule.marque} ${vehicule.modele}` : 'Véhicule inconnu'}</Texte>
            {detailsVehicule ? <Legende>{detailsVehicule}</Legende> : null}
          </View>
          {vehicule ? (
            <View className="items-end">
              <Mono>{vehicule.plaque}</Mono>
              {vehicule.km != null ? <Legende>{kilometrage(vehicule.km)}</Legende> : null}
            </View>
          ) : null}
        </Ligne>
      </Groupe>
    </View>
  );
}
