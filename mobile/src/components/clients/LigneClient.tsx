/**
 * Ligne de la recherche (v2c, reprise de la v2b) : la plaque d’abord (c’est
 * ce qu’on tape le plus souvent), puis le client et le véhicule que la
 * requête vise, et une troisième ligne qui dit où en est la voiture
 * (« Attente pièce · Kit chaîne de distribution · prévue lun. 2 »,
 * « Prêt · 56 min · SMS 10:35 ») : l’appel « elle est prête ? » se répond
 * sans ouvrir d’écran. Jamais de montant.
 *
 * L’appui ouvre l’intervention active de cette voiture ; sans intervention
 * active (ou avec deux voitures actives que la requête ne départage pas), la
 * fiche client. L’accessoire « Fiche client de … » garde l’accès au
 * dossier. Les lignes s’enchaînent dans un bloc arrondi (première et
 * dernière arrondies).
 */

import { Pressable, View } from 'react-native';

import { impulsion } from '@/components/ui/haptique';
import { Icone, type NomIcone } from '@/components/ui/icone';
import { Plaque } from '@/components/ui/plaque';
import { Legende, Texte } from '@/components/ui/texte';
import { dePrenom, nomClient } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

import { AvatarClient } from './AvatarClient';
import { libelleVehicule, type EtatRecherche, type FicheClient, type ResultatLigne } from './outils';

type Props = {
  fiche: FicheClient;
  /** Véhicule en tête, état de sa voiture, cible de l’appui (`resultatLigne`) */
  resultat: ResultatLigne;
  premiere: boolean;
  derniere: boolean;
  /** Appui principal : l’intervention active si `resultat.versIntervention`, sinon la fiche client */
  onPress: () => void;
  /** Accessoire « Fiche client de … », présent quand l’appui principal ouvre l’intervention */
  onFicheClient: () => void;
};

/** Icône de l’état : pause pour un blocage, alerte pour un retard, coche une fois prévenu. */
function iconeEtat(e: EtatRecherche): NomIcone {
  switch (e.genre) {
    case 'bloquee':
      return 'pause';
    case 'retard':
      return 'alerte';
    case 'prete':
      return e.ton === 'ok' ? 'valider' : 'telephone';
    case 'atelier':
      return 'cle';
    case 'rdv':
      return 'horloge';
    case 'livree':
      return 'valider';
  }
}

export function LigneClient({ fiche, resultat, premiere, derniere, onPress, onFicheClient }: Props) {
  const t = useTheme();
  const { client, vehicules } = fiche;
  const { vehicule, etat, versIntervention } = resultat;
  const nom = nomClient(client);
  const autres = vehicules.length - 1;
  const detail = vehicule
    ? `${libelleVehicule(vehicule)}${autres > 0 ? ` · +${autres} véhicule${autres > 1 ? 's' : ''}` : ''}`
    : 'Aucun véhicule';

  const label = [nom, vehicule ? `${libelleVehicule(vehicule)}, plaque ${vehicule.plaque}` : 'aucun véhicule', etat?.label]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      className={`flex-row overflow-hidden border-x border-b border-line bg-surface dark:border-line-dark dark:bg-surface-dark ${
        premiere ? 'rounded-t-2xl border-t' : ''
      } ${derniere ? 'rounded-b-2xl' : ''}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={versIntervention ? 'Ouvre l’intervention' : 'Ouvre la fiche client'}
        onPress={() => {
          impulsion('leger');
          onPress();
        }}
        className="flex-1 gap-1.5 px-4 py-3 active:bg-surface2 dark:active:bg-surface2-dark">
        <View className="flex-row items-center gap-3">
          <View className="w-[118px]">{vehicule ? <Plaque plaque={vehicule.plaque} /> : <AvatarClient client={client} taille={30} />}</View>
          <View className="flex-1">
            <Texte numberOfLines={1} className="font-semibold">
              {nom}
            </Texte>
            <Legende numberOfLines={1} className="text-[14px]">
              {detail}
            </Legende>
          </View>
          {versIntervention ? null : <Icone nom="chevron.droite" taille={15} couleur={t.faint} />}
        </View>
        {etat ? (
          <View className="flex-row items-start gap-1.5">
            <View className="h-[19px] justify-center">
              <Icone nom={iconeEtat(etat)} taille={13} couleur={t[etat.ton]} poids={etat.genre === 'bloquee' ? 'bold' : 'medium'} />
            </View>
            <Legende ton={etat.ton} numberOfLines={2} maxFontSizeMultiplier={1.6} className="flex-1 text-[14px] font-medium leading-[19px]">
              {etat.texte}
            </Legende>
          </View>
        ) : null}
      </Pressable>
      {versIntervention ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Fiche client ${dePrenom(nom)}`}
          hitSlop={{ top: 4, bottom: 4 }}
          onPress={() => {
            impulsion('leger');
            onFicheClient();
          }}
          className="w-12 items-center justify-center border-l border-line active:bg-surface2 dark:border-line-dark dark:active:bg-surface2-dark">
          <Icone nom="clients" taille={18} couleur={t.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
