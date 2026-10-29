/**
 * Appel dont le réceptionniste a créé une fiche à valider : résumé, fiche
 * proposée (véhicule, prestation, créneau) et le geste suivant évident,
 * « Valider et planifier », en bouton principal. Pour qui voit tout le
 * planning, le mécanicien se choisit sur la carte (« Plus tard » par
 * défaut) : valider attribue du même geste. Ignorer demande une
 * confirmation.
 *
 * v2c (E7) : « Valider et planifier » reste visible sans défiler sous la
 * carte « Appel en cours ». Les puces Mécanicien tiennent sur une seule
 * rangée qui défile de côté et portent la charge du jour du créneau
 * (« Elias · 3 », la phrase entière pour VoiceOver) ; « Valider et
 * planifier » et « Modifier » partagent une rangée, « Ignorer » passe en
 * tête de carte.
 *
 * Relecture du 29 octobre : pendant la garde du double appui, les boutons
 * sont inertes (`desactive`) ; une fiche validée reste un moment à sa
 * place, « Confirmé » (`confirmee`), pour que la carte suivante ne remonte
 * pas sous le doigt.
 */

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { jourDeCharge, quandCharge, voituresEtHeures } from '@/components/intervention/FeuilleAttribution';
import { Puce } from '@/components/nouvelle-intervention/Puce';
import { Avatar } from '@/components/ui/avatar';
import { Bouton } from '@/components/ui/bouton';
import { Carte } from '@/components/ui/carte';
import { FeuilleConfirmation } from '@/components/ui/feuille-confirmation';
import { Icone, type NomIcone } from '@/components/ui/icone';
import { PastilleStatut } from '@/components/ui/pastille';
import { Etiquette, Legende, Mono, Secondaire, Texte } from '@/components/ui/texte';
import { chargeDuJour } from '@/domain/echeances';
import type { Appel, Intervention, Membre, Vehicule } from '@/domain/types';
import { dePrenom, duree, dureeSecondes, formaterTelephone, quand } from '@/lib/format';
import { useDonnees } from '@/state/session';
import { useTheme } from '@/theme/tokens';

type Props = {
  appel: Appel;
  intervention: Intervention;
  vehicule?: Vehicule;
  /** Mécaniciens proposés (actifs, hors réceptionnaire) ; vide ou absent = pas de choix sur la carte */
  mecaniciens?: Membre[];
  chargement?: boolean;
  /** Garde du double appui : boutons inertes */
  desactive?: boolean;
  /** Fiche validée, gardée un moment à sa place : « Confirmé · Elias · jeu. 29 oct. 14:00 » et « Ouvrir » */
  confirmee?: { texte: string; onOuvrir: () => void };
  /** Valide la fiche, puis l’attribue au mécanicien choisi (null = plus tard) */
  onValider: (membreId: string | null) => void | Promise<void>;
  onModifier: () => void;
  onIgnorer: () => void | Promise<void>;
};

function LigneFiche({ icone, texte, detail, mono }: { icone: NomIcone; texte: string; detail?: string; mono?: boolean }) {
  const t = useTheme();
  return (
    <View className="flex-row items-center gap-2.5">
      <Icone nom={icone} taille={16} couleur={t.muted} />
      <Texte className="flex-1 text-[15px]" numberOfLines={1}>
        {texte}
      </Texte>
      {detail ? mono ? <Mono ton="muted">{detail}</Mono> : <Legende>{detail}</Legende> : null}
    </View>
  );
}

export function CarteAppelAValider({
  appel,
  intervention,
  vehicule,
  mecaniciens,
  chargement,
  desactive,
  confirmee,
  onValider,
  onModifier,
  onIgnorer,
}: Props) {
  const t = useTheme();
  const [confirmer, setConfirmer] = useState(false);
  const [mecanicien, setMecanicien] = useState<string | null>(intervention.membreId);
  const [resumeEntier, setResumeEntier] = useState(false);
  const interventions = useDonnees((s) => s.interventions);
  const nom = appel.appelant ?? formaterTelephone(appel.numero);

  // Charge le jour du créneau proposé (aujourd’hui s’il est passé).
  const maintenant = new Date();
  const jourCreneau = jourDeCharge(new Date(intervention.debut), maintenant);
  const quandCreneau = quandCharge(jourCreneau, maintenant);
  const chargeDe = (m: Membre) => chargeDuJour(interventions, m.id, jourCreneau);
  const inerte = chargement || desactive || Boolean(confirmee);

  return (
    <Carte className="p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Texte className="font-semibold" numberOfLines={1}>
            {nom}
          </Texte>
          <Legende className="mt-0.5">
            {quand(appel.debut)} · {dureeSecondes(appel.dureeSec)}
            {appel.horsHoraires ? ' · hors horaires' : ''}
          </Legende>
        </View>
        {confirmee ? (
          <PastilleStatut statut={intervention.statut} court />
        ) : (
          // La pastille « À valider » redirait le titre de la section : « Ignorer » prend sa place (confirmation demandée).
          <Bouton
            compact
            variante="discret"
            className="-mr-2 -mt-1"
            onPress={() => setConfirmer(true)}
            desactive={inerte}
            accessibilityLabel={`Ignorer l’appel ${dePrenom(nom)}`}>
            Ignorer
          </Bouton>
        )}
      </View>

      {/* Résumé sur deux lignes (la fiche proposée en reprend l’essentiel), en entier d’un appui ; VoiceOver le lit en entier. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={appel.resume}
        accessibilityHint={resumeEntier ? undefined : 'Afficher le résumé en entier'}
        onPress={() => setResumeEntier((o) => !o)}
        className="mt-2 min-h-[44px] justify-center">
        <Secondaire numberOfLines={resumeEntier ? undefined : 2}>{appel.resume}</Secondaire>
      </Pressable>

      {/* Fiche proposée en deux lignes (voiture ; prestation, créneau et durée) : la carte reste assez courte pour montrer « Valider et planifier ». */}
      <View
        accessible
        accessibilityLabel={`Fiche proposée : ${vehicule ? `${vehicule.marque} ${vehicule.modele}, ${vehicule.plaque}` : 'véhicule à préciser'}, ${intervention.prestation}, ${quand(intervention.debut)}, ${duree(intervention.dureeMin)}`}
        className="mt-2 gap-2 rounded-xl bg-surface2 px-3 py-2.5 dark:bg-surface2-dark">
        <LigneFiche
          icone="voiture"
          texte={vehicule ? `${vehicule.marque} ${vehicule.modele}` : 'Véhicule à préciser'}
          detail={vehicule?.plaque}
          mono
        />
        <LigneFiche icone="cle" texte={intervention.prestation} detail={`${quand(intervention.debut)} · ${duree(intervention.dureeMin)}`} />
      </View>

      {mecaniciens?.length ? (
        <View className="mt-2">
          {/* Une seule rangée qui défile de côté, jusqu’aux bords de la carte, l’intitulé en tête ; le retrait vertical garde la zone tactile élargie des puces dans la rangée. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            className="-mx-4"
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 2, gap: 8, alignItems: 'center' }}>
            {/* « Mécanicien · demain » : le chiffre de chaque puce est sa charge ce jour-là. */}
            <Etiquette accessibilityRole="header" className="mr-1">
              {`Mécanicien · ${quandCreneau}`}
            </Etiquette>
            <Puce label="Plus tard" active={mecanicien === null} onPress={() => setMecanicien(null)} desactivee={inerte} />
            {mecaniciens.map((m) => (
              <Puce
                key={m.id}
                label={`${m.prenom} · ${chargeDe(m).nb}`}
                active={mecanicien === m.id}
                onPress={() => setMecanicien(m.id)}
                desactivee={inerte}
                icone={<Avatar membre={m} taille={22} />}
                accessibilityLabel={`${m.prenom} ${m.nom}, ${voituresEtHeures(chargeDe(m), true)} ${quandCreneau}`}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {confirmee ? (
        // Même hauteur que la rangée des boutons : rien ne bouge sous le doigt, la zone de « Valider » ne répond plus.
        <View className="mt-3 flex-row items-center gap-2">
          <View
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={confirmee.texte}
            className="min-h-[52px] flex-1 flex-row items-center gap-2 rounded-2xl bg-ok-soft px-4 dark:bg-ok-softdark">
            <Icone nom="valider" taille={18} couleur={t.ok} />
            <Texte className="flex-1 text-[15px] font-semibold" numberOfLines={2}>
              {confirmee.texte}
            </Texte>
          </View>
          <Bouton variante="secondaire" onPress={confirmee.onOuvrir} accessibilityLabel={`Ouvrir la fiche · ${confirmee.texte}`}>
            Ouvrir
          </Bouton>
        </View>
      ) : (
        <View className="mt-3 flex-row gap-2">
          <Bouton
            className="flex-1"
            icone={<Icone nom="valider" taille={18} couleur={t.blanc} />}
            // Sans choix sur la carte, l’attribution de la fiche reste celle du moment.
            onPress={() => onValider(mecaniciens?.length ? mecanicien : intervention.membreId)}
            chargement={chargement}
            desactive={desactive}>
            Valider et planifier
          </Bouton>
          <Bouton variante="secondaire" onPress={onModifier} desactive={inerte}>
            Modifier
          </Bouton>
        </View>
      )}

      <FeuilleConfirmation
        ouverte={confirmer}
        onFermer={() => setConfirmer(false)}
        titre="Ignorer cet appel ?"
        texte="La fiche proposée sera annulée. L’appel reste dans l’historique et vous pourrez rappeler le client."
        libelle="Ignorer l’appel"
        variante="danger"
        onConfirmer={async () => {
          setConfirmer(false);
          await onIgnorer();
        }}
      />
    </Carte>
  );
}
