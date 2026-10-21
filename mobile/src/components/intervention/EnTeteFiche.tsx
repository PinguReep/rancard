/**
 * Haut de la fiche : la voiture (plaque, modèle), le travail, la frise
 * Reçu → En cours → Prêt → Livré, trois repères (horaire, mécanicien,
 * compteur) et le client avec ses deux gestes : écrire, appeler.
 */

import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Avatar, Carte, Frise, Icone, Legende, Pastille, Plaque, Secondaire, Texte, Titre, impulsion } from '@/components/ui';
import { BLOCAGES, estBloquee } from '@/domain/statuts';
import type { Client, Intervention, Membre, Vehicule } from '@/domain/types';
import { formaterTelephone, heure, jourRelatif, telHref } from '@/lib/format';
import { smsHref } from '@/lib/suivi';
import { halo, useTheme } from '@/theme/tokens';

type Props = {
  intervention: Intervention;
  client?: Client;
  vehicule?: Vehicule;
  mecanicien: Membre | null;
  /** Option SMS du garage */
  sms: boolean;
  /** Toucher la case « Mécanicien » pour réattribuer */
  onAttribuer?: () => void;
};

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Repere({ titre, children, onPress, label, large }: { titre: string; children: ReactNode; onPress?: () => void; label?: string; large?: boolean }) {
  const contenu = (
    <>
      <Text maxFontSizeMultiplier={1.3} className="text-[11px] font-semibold uppercase tracking-[1px] text-muted dark:text-muted-dark" numberOfLines={1}>
        {titre}
      </Text>
      <View className="mt-1.5 flex-row items-center gap-1.5">{children}</View>
    </>
  );
  if (!onPress) return <Carte className={`${large ? 'flex-[1.4]' : 'flex-1'} px-3 py-3`}>{contenu}</Carte>;
  return (
    <Carte className="flex-1 px-3 py-3" onPress={onPress} accessibilityLabel={label}>
      {contenu}
    </Carte>
  );
}

export function EnTeteFiche({ intervention: i, client, vehicule, mecanicien, sms, onAttribuer }: Props) {
  const router = useRouter();
  const t = useTheme();
  const nom = client ? `${client.prenom} ${client.nom}` : 'Client inconnu';
  const detailVehicule = vehicule ? [`${vehicule.marque} ${vehicule.modele}`, vehicule.version, vehicule.annee].filter(Boolean).join(' · ') : 'Véhicule inconnu';
  const bloquee = estBloquee(i) && i.blocage ? i.blocage : null;
  const jour = jourRelatif(i.debut);
  const horaire = `${heure(i.debut)}${i.restitutionPrevue ? ` → ${heure(i.restitutionPrevue)}` : ''}`;

  return (
    <View className="pt-2">
      <View className="flex-row items-center gap-3">
        {vehicule ? <Plaque plaque={vehicule.plaque} grande /> : null}
        <Secondaire className="flex-1" numberOfLines={2}>
          {detailVehicule}
        </Secondaire>
      </View>

      <Titre className="mt-4 text-[30px] leading-[36px]">{i.prestation}</Titre>

      {i.statut === 'a_valider' || i.statut === 'planifie' || i.statut === 'annule' || i.prioritaire ? (
        <View className="mt-3 flex-row flex-wrap gap-1.5">
          {i.statut === 'a_valider' ? <Pastille label="À valider" ton="warn" point /> : null}
          {i.statut === 'planifie' ? <Pastille label="Rendez-vous confirmé" ton="accent" /> : null}
          {i.statut === 'annule' ? <Pastille label="Annulé" ton="muted" /> : null}
          {i.prioritaire ? <Pastille label="Prioritaire" ton="danger" point /> : null}
        </View>
      ) : null}

      {i.statut !== 'annule' ? <Frise intervention={i} /> : null}

      {bloquee ? (
        <View className="mt-5 flex-row items-center gap-2 self-center rounded-full border border-warn/40 bg-warn-soft px-3.5 py-2 dark:border-warn-dark/40 dark:bg-warn-softdark">
          <Icone nom="pause" taille={12} couleur={t.warn} poids="bold" />
          <Text className="text-[14px] font-semibold text-warn dark:text-warn-dark">{BLOCAGES[bloquee].label}</Text>
        </View>
      ) : null}

      <View className="mt-6 flex-row gap-2">
        <Repere large titre={jour === 'aujourd’hui' ? 'Horaire' : majuscule(jour)}>
          <Text maxFontSizeMultiplier={1.3} className="font-mono text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={1} adjustsFontSizeToFit>
            {horaire}
          </Text>
        </Repere>
        <Repere titre="Mécanicien" onPress={onAttribuer} label={onAttribuer ? `Mécanicien : ${mecanicien ? mecanicien.prenom : 'personne'}. Changer` : undefined}>
          {mecanicien ? <Avatar membre={mecanicien} taille={20} /> : null}
          <Texte className="shrink text-[15px] font-bold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {mecanicien ? mecanicien.prenom : 'À attribuer'}
          </Texte>
        </Repere>
        <Repere titre="Compteur">
          <Text maxFontSizeMultiplier={1.3} className="font-mono text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={1} adjustsFontSizeToFit>
            {vehicule?.km != null ? vehicule.km.toLocaleString('fr-FR') : '—'}
          </Text>
        </Repere>
      </View>

      {client ? (
        <Carte className="mt-2.5 flex-row items-center gap-3 py-3 pl-4 pr-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ouvrir la fiche de ${nom}`}
            onPress={() => {
              impulsion('leger');
              router.push(`/client/${client.id}`);
            }}
            className="min-h-[44px] flex-1 justify-center active:opacity-70">
            <Texte className="text-[17px] font-bold" numberOfLines={1}>
              {nom}
            </Texte>
            {client.memo ? (
              <View className="mt-0.5 flex-row items-center gap-1.5">
                <Icone nom="horloge" taille={13} couleur={t.warn} />
                <Legende ton="warn" className="flex-1 text-[14px]" numberOfLines={1}>
                  {client.memo}
                </Legende>
              </View>
            ) : null}
          </Pressable>
          {sms ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Écrire un SMS à ${nom}`}
              onPress={() => {
                impulsion('leger');
                void Linking.openURL(smsHref(client.telephone));
              }}
              className="h-12 w-12 items-center justify-center rounded-full bg-surface2 dark:bg-surface2-dark active:opacity-70">
              <Icone nom="message" taille={20} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Appeler ${nom} au ${formaterTelephone(client.telephone)}`}
            onPress={() => {
              impulsion('moyen');
              void Linking.openURL(telHref(client.telephone));
            }}
            style={t.scheme === 'dark' ? halo(t.ok, 10, 0.5) : undefined}
            className="h-12 w-12 items-center justify-center rounded-full border border-ok/50 bg-ok-soft dark:border-ok-dark/50 dark:bg-ok-softdark active:opacity-70">
            <Icone nom="telephone" taille={20} couleur={t.ok} />
          </Pressable>
        </Carte>
      ) : null}

      {i.demande ? (
        <Carte className="mt-2.5 px-4 py-3">
          <Legende className="font-semibold">Demande du client</Legende>
          <Texte className="mt-1">{i.demande}</Texte>
        </Carte>
      ) : null}
    </View>
  );
}
