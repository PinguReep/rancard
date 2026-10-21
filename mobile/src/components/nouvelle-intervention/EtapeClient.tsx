/**
 * Étape 1 : choisir un client existant (recherche, mêmes règles que
 * l'onglet Clients) ou en créer un nouveau (prénom, nom, mobile).
 */

import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AvatarClient } from '@/components/clients/AvatarClient';
import { BarreRecherche } from '@/components/clients/BarreRecherche';
import { FormulaireClient, type ErreursClient, type ValeursClient } from '@/components/clients/FormulaireClient';
import { filtrerFiches, libelleVehicule, pluriel, type FicheClient } from '@/components/clients/outils';
import { Bouton } from '@/components/ui/bouton';
import { Groupe, Ligne } from '@/components/ui/carte';
import { Icone } from '@/components/ui/icone';
import { Plaque } from '@/components/ui/plaque';
import { Secondaire, Texte } from '@/components/ui/texte';
import { Vide } from '@/components/ui/vide';
import type { Client, Vehicule } from '@/domain/types';
import { useTheme } from '@/theme/tokens';

const MAX_RESULTATS = 30;

type Props = {
  fiches: FicheClient[];
  requete: string;
  onRequete: (q: string) => void;
  /** true = formulaire « nouveau client » affiché à la place de la liste */
  nouveau: boolean;
  onNouveau: (valeursInitiales?: Partial<ValeursClient>) => void;
  onRetourListe: () => void;
  valeurs: ValeursClient;
  onChangeValeurs: (v: ValeursClient) => void;
  erreurs: ErreursClient;
  onChoisir: (c: Client, v?: Vehicule) => void;
  onContinuer: () => void;
};

/** « Manon Lefèvre » → prénom « Manon », nom « Lefèvre » pour préremplir. */
function devinerNom(requete: string): Partial<ValeursClient> {
  const mots = requete.trim().split(/\s+/).filter(Boolean);
  if (!mots.length || /\d/.test(requete)) return {};
  const cap = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);
  return mots.length === 1 ? { nom: cap(mots[0]) } : { prenom: cap(mots[0]), nom: mots.slice(1).map(cap).join(' ') };
}

export function EtapeClient({
  fiches,
  requete,
  onRequete,
  nouveau,
  onNouveau,
  onRetourListe,
  valeurs,
  onChangeValeurs,
  erreurs,
  onChoisir,
  onContinuer,
}: Props) {
  const t = useTheme();

  if (nouveau) {
    return (
      <Animated.View entering={FadeIn.duration(200)}>
        <View className="mb-4 flex-row items-center justify-between">
          <Texte className="font-semibold">Nouveau client</Texte>
          <Bouton variante="discret" compact onPress={onRetourListe}>
            Client existant
          </Bouton>
        </View>
        <FormulaireClient valeurs={valeurs} onChange={onChangeValeurs} erreurs={erreurs} autoFocus onSubmit={onContinuer} />
      </Animated.View>
    );
  }

  const resultats = filtrerFiches(fiches, requete);
  // Une ligne par véhicule : on cherche une voiture, on tombe sur la bonne plaque.
  const lignes = resultats.flatMap<{ f: FicheClient; v?: Vehicule }>((f) => (f.vehicules.length ? f.vehicules.map((v) => ({ f, v })) : [{ f }]));
  const visibles = lignes.slice(0, MAX_RESULTATS);

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <BarreRecherche valeur={requete} onChange={onRequete} placeholder="Plaque, nom ou téléphone…" autoFocus />

      {visibles.length ? (
        <Groupe note={lignes.length > MAX_RESULTATS ? `${pluriel(lignes.length, 'résultat')}, affinez la recherche.` : undefined}>
          {visibles.map(({ f, v }, idx) => (
            <Ligne
              key={`${f.client.id}-${v?.id ?? 'sans'}`}
              onPress={() => onChoisir(f.client, v)}
              derniere={idx === visibles.length - 1}
              accessibilityLabel={`${f.client.prenom} ${f.client.nom}, ${v ? `${libelleVehicule(v)}, plaque ${v.plaque}` : 'aucun véhicule'}`}>
              <View className="w-[118px]">{v ? <Plaque plaque={v.plaque} /> : <AvatarClient client={f.client} taille={30} />}</View>
              <View className="flex-1">
                <Texte numberOfLines={1} className="font-semibold">
                  {f.client.prenom} {f.client.nom}
                </Texte>
                <Secondaire numberOfLines={1}>{v ? libelleVehicule(v) : 'Aucun véhicule'}</Secondaire>
              </View>
              <Icone nom="chevron.droite" taille={15} couleur={t.faint} />
            </Ligne>
          ))}
        </Groupe>
      ) : (
        <Vide
          icone={requete ? 'recherche' : 'clients'}
          titre={requete ? `Rien pour « ${requete.trim()} »` : 'Aucun client'}
        />
      )}

      <Bouton
        variante="secondaire"
        icone={<Icone nom="plus" taille={18} />}
        onPress={() => onNouveau(devinerNom(requete))}
        className="mt-2">
        Nouveau client
      </Bouton>
    </Animated.View>
  );
}
