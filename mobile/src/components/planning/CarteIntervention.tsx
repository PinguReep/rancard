/**
 * Carte d’une intervention dans le planning. Ce que le mécanicien cherche
 * d’abord : la plaque et le modèle, puis le travail, puis où en est la
 * voiture. Elle répond sans ouvrir la fiche (v2c) : pourquoi et pour quand
 * (ligne repère : « Sonde lambda · prévue jeu. 29 », « À prévenir »,
 * « Promise 17:00 »), depuis quand l’état dure (« Attente pièce · 2 j »),
 * combien de temps prévu, qui s’en occupe ; et elle porte le geste suivant
 * (« Reçu », « Démarrer », « Prêt », « Pièce reçue »…).
 *
 * Budget de hauteur : pas plus haute que la carte v2a pour une même voiture,
 * bouton de geste compris (prestation sur une ligne, marges resserrées,
 * bouton qui déborde dans les marges sans agrandir sa rangée).
 *
 * Appui = fiche ; appui long ou appui sur l’état = actions rapides ; appui
 * sur « À attribuer » = choix du mécanicien ; bouton de geste = le geste.
 */

import type { ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { Avatar, Carte, Icone, Legende, Pastille, Plaque, PisteAvancement, Secondaire, Texte, impulsion } from '@/components/ui';
import { repereCarte } from '@/domain/echeances';
import { BLOCAGES, STATUTS, contexteActions, estBloquee, gesteCarte, type Action } from '@/domain/statuts';
import type { Client, Evenement, Intervention, Membre, Statut, Vehicule } from '@/domain/types';
import { depuis, duree, nomClient as nomDuClient } from '@/lib/format';
import { useMembre, usePermissions } from '@/state/session';
import { useTheme, type Palette } from '@/theme/tokens';

import { GesteCarte } from './GesteCarte';
import { depuisEtat, quandCarte } from './logique';

type Props = {
  intervention: Intervention;
  client?: Client;
  vehicule?: Vehicule;
  mecanicien?: Membre | null;
  /** Montrer l’avatar du mécanicien (vue « Tout l’atelier ») */
  avecMecanicien?: boolean;
  /** Jour affiché : l’heure seule si le créneau tombe ce jour, sinon le jour aussi */
  jour?: Date;
  /** Événements de cette intervention : ancienneté, arrivée, client prévenu */
  evenements?: Evenement[];
  /** Voiture nouvellement attribuée à ce membre (`estNouvellePour`) : pastille « Nouvelle » */
  nouvelle?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  /** Appui sur le mot d’état ou la pastille de blocage : même feuille que l’appui long */
  onActions?: () => void;
  /** Appui sur « À attribuer » (vue « Tout l’atelier », voir tout) */
  onAttribuer?: () => void;
  /** Bouton « geste suivant » : fait le geste (`passage.executer`) ; absent, pas de bouton */
  onGeste?: (a: Action) => void;
  /** Contenu sous la carte (bouton « Confirmer » par exemple) */
  pied?: ReactNode;
};

const AUCUN: Evenement[] = [];

/** Mot court de l’état, et sa couleur. */
function etat(statut: Statut, t: Palette): { mot: string; couleur: string } {
  switch (statut) {
    case 'a_valider':
      return { mot: 'À valider', couleur: t.warn };
    case 'planifie':
      return { mot: 'À recevoir', couleur: t.muted };
    case 'termine':
      return { mot: 'Prêt', couleur: t.ok };
    case 'livre':
    case 'annule':
      return { mot: STATUTS[statut].court, couleur: t.muted };
    default:
      return { mot: STATUTS[statut].court, couleur: t.accent };
  }
}

export function CarteIntervention({
  intervention: i,
  client,
  vehicule,
  mecanicien,
  avecMecanicien,
  jour,
  evenements = AUCUN,
  nouvelle,
  onPress,
  onLongPress,
  onActions,
  onAttribuer,
  onGeste,
  pied,
}: Props) {
  const t = useTheme();
  const membre = useMembre();
  const p = usePermissions();
  // Recalculé à chaque rendu (store modifié, écran qui reprend le focus) : pas de minuterie par carte.
  const maintenant = new Date();
  const nomClient = nomDuClient(client);
  const modele = vehicule ? `${vehicule.marque} ${vehicule.modele}` : 'Véhicule inconnu';
  const voiture = vehicule ? `${modele} ${vehicule.plaque}` : modele;
  const quand = quandCarte(i, jour ?? maintenant, maintenant, evenements);
  const bloquee = estBloquee(i) && i.blocage ? i.blocage : null;
  const e = etat(i.statut, t);

  // Ancienneté de l’état : blocage posé, ou passage en Prêt.
  const debutEtat = depuisEtat(i, evenements, maintenant);
  const anciennete = debutEtat ? depuis(debutEtat, maintenant) : null;
  const motEtat = bloquee ? BLOCAGES[bloquee].label : e.mot;
  const motAffiche = anciennete ? `${motEtat} · ${anciennete}` : motEtat;
  const etatLu =
    anciennete && debutEtat
      ? `${bloquee ? BLOCAGES[bloquee].label : STATUTS[i.statut].label} depuis ${depuis(debutEtat, maintenant, true)}`
      : bloquee
        ? BLOCAGES[bloquee].label
        : STATUTS[i.statut].label;

  // Pourquoi et quand (ligne repère), jamais tronqué ; client, durée et mémo se tronquent derrière.
  const repere = repereCarte(i, { maintenant, evenements, jour });
  // Une voiture au garage depuis un jour passé dit déjà « depuis 3 j » : sa durée prévue (« 1 j ») ne s’y ajoute pas.
  const avecDuree = i.statut !== 'termine' && i.statut !== 'livre' && i.dureeMin > 0 && !quand.anciennete;
  const suite = [client ? nomClient : 'Client inconnu', avecDuree ? duree(i.dureeMin) : null, i.memo || null].filter(Boolean).join(' · ');

  // Geste suivant : même contexte que le bouton (GesteCarte), pour réserver sa place.
  const geste = onGeste ? gesteCarte(i, contexteActions(membre, p, evenements, { interventionId: i.id })) : null;

  const close = i.statut === 'livre' || i.statut === 'annule';
  const aAttribuer = avecMecanicien && !mecanicien && !close && onAttribuer ? onAttribuer : null;
  // Sur le web, un bouton ne peut pas en contenir un autre (pied « Confirmer », état, « À attribuer », geste) : la carte perd son rôle.
  const boutonInterieur = Boolean(pied || onActions || aAttribuer || geste);
  const actionsLues = [
    ...(onActions ? [{ name: 'etat', label: `Changer l’état (${motEtat})` }] : []),
    ...(aAttribuer ? [{ name: 'attribuer', label: 'Attribuer un mécanicien' }] : []),
  ];

  const label = [
    nouvelle ? 'Nouvelle' : null,
    i.prioritaire ? 'Prioritaire' : null,
    vehicule ? `${modele}, plaque ${vehicule.plaque}` : modele,
    i.prestation,
    nomClient,
    avecDuree ? `durée ${duree(i.dureeMin)}` : null,
    quand.lu,
    etatLu,
    repere?.label,
    mecanicien ? `attribuée à ${mecanicien.prenom}` : 'non attribuée',
  ]
    .filter(Boolean)
    .join(', ');

  const couleurEtat = bloquee ? t.warn : e.couleur;
  const contenuEtat = bloquee ? (
    <View className="flex-row items-center gap-1.5 rounded-full border border-warn/40 bg-warn-soft px-2.5 py-1 dark:border-warn-dark/40 dark:bg-warn-softdark">
      {/* Avec le bouton de geste, la pastille perd son icône : la ligne tient sur 393 pt. */}
      {geste ? null : <Icone nom="pause" taille={11} couleur={t.warn} poids="bold" />}
      <Text maxFontSizeMultiplier={1.4} className="text-[13px] font-semibold text-warn dark:text-warn-dark">
        {motAffiche}
      </Text>
      {onActions ? <Icone nom="chevron.bas" taille={10} couleur={t.warn} poids="bold" /> : null}
    </View>
  ) : (
    <View className={`-my-1 flex-row items-center gap-1 py-1 ${geste ? '' : 'min-w-[64px] justify-end'}`}>
      <Text maxFontSizeMultiplier={1.4} className={`text-[13px] font-semibold ${geste ? '' : 'text-right'}`} style={{ color: e.couleur }}>
        {motAffiche}
      </Text>
      {onActions ? <Icone nom="chevron.bas" taille={10} couleur={couleurEtat} poids="bold" /> : null}
    </View>
  );

  const qui = !avecMecanicien ? null : mecanicien ? (
    <Avatar membre={mecanicien} taille={24} />
  ) : aAttribuer ? null : (
    <View accessibilityLabel="Non attribué" className="h-6 w-6 rounded-full border border-dashed border-faint dark:border-faint-dark" />
  );

  const etatTouchable = onActions ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`État : ${motEtat}. Changer, ${voiture}`}
      hitSlop={{ top: 8, bottom: 12, left: 8, right: 8 }}
      onPress={() => {
        impulsion('moyen');
        onActions();
      }}
      onLongPress={() => {
        impulsion('moyen');
        onActions();
      }}
      delayLongPress={350}
      className="active:opacity-60">
      {contenuEtat}
    </Pressable>
  ) : (
    <View>{contenuEtat}</View>
  );

  return (
    <Pressable
      accessibilityRole={Platform.OS === 'web' && boutonInterieur ? undefined : 'button'}
      accessibilityLabel={label}
      accessibilityHint={onLongPress ? 'Appui long pour les actions rapides' : undefined}
      // Sur iOS, la carte regroupe son contenu pour VoiceOver : « À attribuer » et l’état passent par le rotor,
      // en plus de l’appui long (indice v1).
      accessibilityActions={actionsLues.length ? actionsLues : undefined}
      onAccessibilityAction={(ev) => {
        if (ev.nativeEvent.actionName === 'attribuer') aAttribuer?.();
        if (ev.nativeEvent.actionName === 'etat') onActions?.();
      }}
      onPress={() => {
        impulsion('leger');
        onPress();
      }}
      onLongPress={
        onLongPress
          ? () => {
              impulsion('moyen');
              onLongPress();
            }
          : undefined
      }
      delayLongPress={350}
      className="active:opacity-80">
      <Carte className="px-4 pb-3 pt-3.5">
        <View className="flex-row items-center gap-2.5">
          {vehicule ? <Plaque plaque={vehicule.plaque} /> : null}
          <Secondaire ton="ink" className="flex-1 font-medium" numberOfLines={1}>
            {modele}
          </Secondaire>
          <Text
            maxFontSizeMultiplier={1.4}
            // L’alerte passe en police normale, plus étroite : le modèle garde sa place.
            className={quand.alerte ? 'text-[13px] font-semibold text-warn dark:text-warn-dark' : 'font-mono text-[14px] text-muted dark:text-muted-dark'}>
            {quand.texte}
          </Text>
        </View>

        {/* Prestation sur une ligne (v2a : deux) : la carte ne grandit pas avec le bouton. */}
        <View className="mt-2 flex-row items-center gap-2">
          {i.prioritaire ? <View accessibilityLabel="Prioritaire" className="h-2 w-2 rounded-full bg-danger dark:bg-danger-dark" /> : null}
          {nouvelle ? <Pastille label="Nouvelle" ton="accent" /> : null}
          <Texte className="flex-1 text-[19px] font-bold leading-[24px] tracking-tight" numberOfLines={1}>
            {i.prestation}
          </Texte>
        </View>

        <View className="mt-0.5 flex-row items-center gap-2">
          <View className="flex-1 flex-row items-center">
            {repere ? (
              <Text maxFontSizeMultiplier={1.5} className="flex-shrink text-[14px] font-semibold leading-[18px]" style={{ color: t[repere.ton] }}>
                {repere.texte}
              </Text>
            ) : null}
            <Legende className="flex-1 text-[14px]" numberOfLines={1}>
              {/* Espace insécable en tête : le web ne la supprime pas entre deux textes. */}
              {repere ? ` · ${suite}` : suite}
            </Legende>
          </View>
          {aAttribuer ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`À attribuer, ${voiture}`}
              hitSlop={{ top: 14, bottom: 6, left: 6, right: 6 }}
              onPress={() => {
                impulsion('leger');
                aAttribuer();
              }}
              className="rounded-full bg-warn-soft px-2.5 py-1 active:opacity-70 dark:bg-warn-softdark">
              <Text maxFontSizeMultiplier={1.4} className="text-[13px] font-bold text-warn dark:text-warn-dark">
                À attribuer
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/*
          Piste, état, puis qui et le geste à droite ; avec un texte agrandi, ce groupe passe dessous, aligné à droite.
          Voiture bloquée qui porte un geste : la pastille ambrée dit l’état, la piste cède sa place (la rangée tient sur 393 pt).
        */}
        <View className="mt-2 flex-row flex-wrap items-center gap-x-3 gap-y-2">
          {geste ? (
            bloquee ? null : <PisteAvancement intervention={i} compacte />
          ) : (
            <View className="min-w-[120px] flex-1 flex-row">
              <PisteAvancement intervention={i} />
            </View>
          )}
          {etatTouchable}
          {qui || (onGeste && geste) ? (
            <View className="ml-auto flex-row items-center gap-2">
              {qui}
              {onGeste && geste ? (
                // Visible 36 pt, posé dans les marges (−4 pt en haut et en bas) : la rangée ne grandit pas.
                <View className="-my-1">
                  <GesteCarte intervention={i} client={client} vehicule={vehicule} evenements={evenements} onAction={onGeste} />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {pied ? <View className="mt-3 flex-row">{pied}</View> : null}
      </Carte>
    </Pressable>
  );
}
