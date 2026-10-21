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
import { Legende, Secondaire, Texte } from '@/components/ui/texte';
import { Vide } from '@/components/ui/vide';
import type { Client } from '@/domain/types';
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
  onChoisir: (c: Client) => void;
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
  const visibles = resultats.slice(0, MAX_RESULTATS);

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <BarreRecherche valeur={requete} onChange={onRequete} autoFocus />

      {resultats.length ? (
        <Groupe note={resultats.length > MAX_RESULTATS ? `${pluriel(resultats.length, 'résultat')}, affinez la recherche.` : undefined}>
          {visibles.map((f, idx) => {
            const v = f.vehicules[0];
            const resume = v
              ? `${libelleVehicule(v)} · ${v.plaque}${f.vehicules.length > 1 ? ` · +${f.vehicules.length - 1}` : ''}`
              : 'Aucun véhicule';
            return (
              <Ligne
                key={f.client.id}
                onPress={() => onChoisir(f.client)}
                derniere={idx === visibles.length - 1}
                accessibilityLabel={`${f.client.prenom} ${f.client.nom}, ${resume}`}>
                <AvatarClient client={f.client} taille={36} />
                <View className="flex-1">
                  <Texte numberOfLines={1} className="font-semibold">
                    {f.client.prenom} {f.client.nom}
                  </Texte>
                  <Secondaire numberOfLines={1}>{resume}</Secondaire>
                </View>
                <Icone nom="chevron.droite" taille={16} couleur={t.faint} />
              </Ligne>
            );
          })}
        </Groupe>
      ) : (
        <Vide
          icone={requete ? 'recherche' : 'clients'}
          titre={requete ? `Aucun client pour “${requete.trim()}”` : 'Aucun client'}
          texte={requete ? 'Créez la fiche en quelques secondes.' : 'Commencez par créer la fiche du client.'}
        />
      )}

      <Bouton
        variante="secondaire"
        icone={<Icone nom="plus" taille={18} />}
        onPress={() => onNouveau(devinerNom(requete))}
        className="mt-2">
        Nouveau client
      </Bouton>
      <Legende className="mt-3 text-center">Choisissez un client pour passer au véhicule.</Legende>
    </Animated.View>
  );
}
