/**
 * Haut de la fiche : la voiture (plaque, modèle), le travail, la frise
 * Reçu → En cours → Prêt → Livré, trois repères (horaire, mécanicien,
 * compteur) et le client avec ses deux gestes : écrire, appeler.
 *
 * Les cases se touchent pour corriger sans annuler : Horaire déplace le
 * rendez-vous (à valider, confirmé) ou fixe le retour prévu (voiture au
 * garage), Mécanicien réattribue, Compteur relève le kilométrage au dépôt
 * de cette intervention (D7 : propre à chaque intervention, jamais
 * obligatoire).
 */

import { format, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { telephoneComposable } from '@/components/clients/outils';
import { Avatar, Carte, Frise, Icone, Legende, Pastille, Plaque, Secondaire, Texte, Titre, impulsion } from '@/components/ui';
import { retourEchu } from '@/domain/echeances';
import { BLOCAGES, estBloquee } from '@/domain/statuts';
import type { Client, Intervention, Membre, Vehicule } from '@/domain/types';
import { dePrenom, formaterTelephone, heure, jourCourt, jourRelatif, nomClient, sansHeure, telHref } from '@/lib/format';
import { smsHref, texteSmsBulle } from '@/lib/suivi';
import { halo, useTheme } from '@/theme/tokens';

type Props = {
  intervention: Intervention;
  client?: Client;
  vehicule?: Vehicule;
  mecanicien: Membre | null;
  /**
   * Proposer « Écrire un SMS » : un lien `sms:` qui ouvre l’app Messages du
   * téléphone, sans frais, donc dès que le client a un mobile : du socle,
   * avec ou sans la prestation « Relances SMS », qui ne régit que les SMS
   * envoyés par Rencar.
   */
  sms: boolean;
  /**
   * Rédaction des SMS par l’IA active : la bulle ouvre la feuille « Écrire
   * à … » (objet, texte à relire, « Rédiger avec l’IA ») au lieu de l’app SMS.
   */
  onEcrire?: () => void;
  /** Toucher la case « Mécanicien » pour réattribuer */
  onAttribuer?: () => void;
  /** Toucher la case « Horaire » d’une fiche à valider ou confirmée : déplacer le rendez-vous */
  onDeplacer?: () => void;
  /** Toucher la case « Horaire » d’une voiture reçue, en cours ou prête : fixer le retour prévu */
  onRetourPrevu?: () => void;
  /** Toucher la case « Compteur » : kilométrage au dépôt (hors livrée et annulée) */
  onKilometrage?: () => void;
};

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « jeu. 29 17:00 », « jeu. 29 » pour un retour sans heure. */
function retour(iso: string, debut: string): { texte: string; parle: string; autreJour: boolean } {
  const memeJour = isSameDay(new Date(iso), new Date(debut));
  const h = sansHeure(iso) ? null : heure(iso);
  const texte = [memeJour ? null : format(new Date(iso), 'EEE d', { locale: fr }), h].filter(Boolean).join(' ');
  const parle = [memeJour ? 'le même jour' : format(new Date(iso), 'EEEE d MMMM', { locale: fr }), h ? `à ${h}` : null].filter(Boolean).join(' ');
  // Retour le jour même sans heure : le jour seul plutôt qu’un « 00:00 » trompeur.
  return { texte: texte || format(new Date(iso), 'EEE d', { locale: fr }), parle, autreJour: !memeJour };
}

function Repere({
  titre,
  children,
  onPress,
  label,
  large,
  alerte,
}: {
  titre: string;
  children: ReactNode;
  onPress?: () => void;
  label?: string;
  large?: boolean;
  /** Ligne d’alerte sous la valeur (« En retard »), en toutes lettres et en rouge */
  alerte?: string;
}) {
  const contenu = (
    <>
      <Text maxFontSizeMultiplier={1.3} className="text-[11px] font-semibold uppercase tracking-[1px] text-muted dark:text-muted-dark" numberOfLines={1}>
        {titre}
      </Text>
      <View className="mt-1.5 flex-row items-center gap-1.5">{children}</View>
      {alerte ? (
        <Text maxFontSizeMultiplier={1.3} className="mt-0.5 text-[13px] font-semibold text-danger dark:text-danger-dark" numberOfLines={1}>
          {alerte}
        </Text>
      ) : null}
    </>
  );
  const taille = large ? 'flex-[1.4]' : 'flex-1';
  if (!onPress) {
    return (
      <Carte className={`${taille} px-3 py-3`} accessible={Boolean(label)} accessibilityLabel={label}>
        {contenu}
      </Carte>
    );
  }
  return (
    <Carte className={`${taille} px-3 py-3`} onPress={onPress} accessibilityLabel={label}>
      {contenu}
    </Carte>
  );
}

export function EnTeteFiche({ intervention: i, client, vehicule, mecanicien, sms, onEcrire, onAttribuer, onDeplacer, onRetourPrevu, onKilometrage }: Props) {
  const router = useRouter();
  const t = useTheme();
  const nom = nomClient(client);
  const detailVehicule = vehicule ? [`${vehicule.marque} ${vehicule.modele}`, vehicule.version, vehicule.annee].filter(Boolean).join(' · ') : 'Véhicule inconnu';
  const bloquee = estBloquee(i) && i.blocage ? i.blocage : null;
  const jour = jourRelatif(i.debut);
  // « Horaire », « Demain », « Hier », sinon le jour court (« dim. 25 oct. ») qui tient dans la case.
  const titreHoraire = jour === 'aujourd’hui' ? 'Horaire' : jour === 'demain' || jour === 'hier' ? majuscule(jour) : jourCourt(i.debut);
  // Un retour prévu un autre jour porte son jour : « 08:30 → jeu. 29 17:00 ».
  const fin = i.restitutionPrevue ? retour(i.restitutionPrevue, i.debut) : null;
  const debutParle = format(new Date(i.debut), "EEEE d MMMM 'à' HH:mm", { locale: fr });

  // Horaire : déplacer un rendez-vous pas encore là, ou fixer le retour d’une voiture au garage.
  const avantArrivee = i.statut === 'a_valider' || i.statut === 'planifie';
  const auGarage = i.statut === 'recu' || i.statut === 'en_cours' || i.statut === 'termine';
  const toucherHoraire = avantArrivee ? onDeplacer : auGarage ? onRetourPrevu : undefined;
  // Retour prévu dépassé (voiture reçue ou en cours) : la case le dit, comme la carte et la recherche.
  const retard = retourEchu(i, new Date());
  const labelHoraire = avantArrivee
    ? `Horaire : ${debutParle}. Déplacer le rendez-vous`
    : `Horaire : ${debutParle}, retour prévu ${fin ? fin.parle : 'à définir'}${retard ? ', en retard' : ''}. ${fin ? 'Modifier' : 'Fixer'} le retour prévu`;

  // Compteur : relevé au dépôt de cette intervention, modifiable tant qu’elle n’est pas close.
  const close = i.statut === 'livre' || i.statut === 'annule';
  const km = i.kmDepot != null ? i.kmDepot.toLocaleString('fr-FR') : null;
  const toucherKm = close ? undefined : onKilometrage;
  const labelKm = `Compteur au dépôt : ${i.kmDepot != null ? `${i.kmDepot.toLocaleString('fr-FR')} kilomètres` : 'non relevé'}${toucherKm ? `. ${km ? 'Modifier' : 'Relever'}` : ''}`;
  // Appel : tout numéro composable, étranger compris (pas inventé) ; le SMS, lui, attend un mobile français (D6).
  const telephone = client?.telephone?.trim() && telephoneComposable(client.telephone) ? client.telephone : null;

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
        <Repere large titre={titreHoraire} onPress={toucherHoraire} label={toucherHoraire ? labelHoraire : undefined} alerte={retard ? 'En retard' : undefined}>
          {fin?.autreJour ? (
            // « 08:30 → jeu. 29 17:00 » : le retour d’un autre jour passe à la ligne plutôt que d’être coupé.
            <View className="flex-1">
              <Text maxFontSizeMultiplier={1.3} className="font-mono text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={1}>
                {`${heure(i.debut)} →`}
              </Text>
              <Text maxFontSizeMultiplier={1.3} className="font-mono text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={1} adjustsFontSizeToFit>
                {fin.texte}
              </Text>
            </View>
          ) : (
            <Text maxFontSizeMultiplier={1.3} className="font-mono text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={1} adjustsFontSizeToFit>
              {fin ? `${heure(i.debut)} → ${fin.texte}` : heure(i.debut)}
            </Text>
          )}
        </Repere>
        <Repere titre="Mécanicien" onPress={onAttribuer} label={onAttribuer ? `Mécanicien : ${mecanicien ? mecanicien.prenom : 'personne'}. Changer` : undefined}>
          {mecanicien ? <Avatar membre={mecanicien} taille={20} /> : null}
          <Texte className="shrink text-[15px] font-bold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {mecanicien ? mecanicien.prenom : 'À attribuer'}
          </Texte>
        </Repere>
        <Repere titre="Compteur" onPress={toucherKm} label={labelKm}>
          {km ? (
            <Text maxFontSizeMultiplier={1.3} className="font-mono text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={1} adjustsFontSizeToFit>
              {km}
              {/* L’unité en petit : « 113 450 km » tient dans la case sans rétrécir le nombre. */}
              <Text className="font-sans text-[11px] font-semibold text-muted dark:text-muted-dark">{' km'}</Text>
            </Text>
          ) : (
            // Deux lignes au besoin plutôt qu’un « Non rel… » coupé.
            <Texte ton={toucherKm ? 'accent' : 'muted'} className="text-[14px] font-semibold leading-[18px]" numberOfLines={2}>
              Non relevé
            </Texte>
          )}
        </Repere>
      </View>

      {client ? (
        <Carte className="mt-2.5 flex-row items-center gap-3 py-3 pl-4 pr-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ouvrir la fiche ${dePrenom(nom)}`}
            onPress={() => {
              impulsion('leger');
              router.push(`/client/${client.id}`);
            }}
            className="min-h-[44px] flex-1 justify-center active:opacity-70">
            <Texte className="text-[17px] font-bold" numberOfLines={1}>
              {nom}
            </Texte>
            {!sms ? (
              // D6 : mobile facultatif, plus de faux numéro ; la fiche client se complète en un appui.
              <Legende ton="warn" className="mt-0.5 text-[14px]">
                Mobile à compléter
              </Legende>
            ) : null}
            {client.memo ? (
              <View className="mt-0.5 flex-row items-start gap-1.5">
                {/* Icône calée sur la première ligne quand le mémo en prend plusieurs. */}
                <View className="mt-[3px]">
                  <Icone nom="horloge" taille={13} couleur={t.warn} />
                </View>
                <Legende ton="warn" className="flex-1 text-[14px]" numberOfLines={3}>
                  {client.memo}
                </Legende>
              </View>
            ) : null}
          </Pressable>
          {/* App SMS du téléphone : du socle, avec ou sans la prestation « Relances SMS ». */}
          {sms && telephone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Écrire un SMS à ${nom}`}
              onPress={() => {
                impulsion('leger');
                if (onEcrire) {
                  onEcrire();
                  return;
                }
                // Un texte court avec le lien de suivi : le client peut suivre sa voiture dès ce premier message.
                void Linking.openURL(smsHref(telephone, texteSmsBulle({ prenom: client.prenom, token: i.suiviToken })));
              }}
              className="h-12 w-12 items-center justify-center rounded-full bg-surface2 dark:bg-surface2-dark active:opacity-70">
              <Icone nom="message" taille={20} />
            </Pressable>
          ) : null}
          {telephone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Appeler ${nom} au ${formaterTelephone(telephone)}`}
              onPress={() => {
                impulsion('moyen');
                void Linking.openURL(telHref(telephone));
              }}
              style={t.scheme === 'dark' ? halo(t.ok, 10, 0.5) : undefined}
              className="h-12 w-12 items-center justify-center rounded-full border border-ok/50 bg-ok-soft dark:border-ok-dark/50 dark:bg-ok-softdark active:opacity-70">
              <Icone nom="telephone" taille={20} couleur={t.ok} />
            </Pressable>
          ) : null}
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
