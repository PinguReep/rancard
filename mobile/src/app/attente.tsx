/**
 * Écran d'attente d'un compte créé dans l'app (« Créer un compte ») : le
 * garage attend la validation de l'équipe Rencar, la base ne donne accès à
 * aucune donnée d'ici là. Une action principale, « Actualiser » ; le retour
 * de l'app au premier plan revérifie aussi. On peut se déconnecter, ou
 * supprimer la demande (compte compris), après confirmation.
 */

import { useEffect, useState } from 'react';
import { AppState, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bouton, Carte, Ecran, Erreur, Etiquette, FeuilleConfirmation, Icone, Legende, Secondaire, Texte, Titre, impulsion } from '@/components/ui';
import { BACKEND } from '@/data';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/tokens';

export default function Attente() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const demande = useSession((s) => s.demande);
  const actualiser = useSession((s) => s.actualiserDemande);
  const deconnecter = useSession((s) => s.deconnecter);
  const supprimer = useSession((s) => s.supprimerDemande);
  const [verifie, setVerifie] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [feuille, setFeuille] = useState(false);

  // Retour au premier plan : la demande a peut-être été validée entre-temps.
  useEffect(() => {
    const abonnement = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') void actualiser().catch(() => undefined);
    });
    return () => {
      abonnement.remove();
    };
  }, [actualiser]);

  async function verifier() {
    setErreur(null);
    setVerifie(false);
    try {
      await actualiser();
      // Toujours là : la demande attend encore (sinon l'écran a déjà changé).
      setVerifie(true);
    } catch (e) {
      setErreur((e as Error).message || 'Impossible de vérifier la demande pour le moment.');
      impulsion('erreur');
    }
  }

  async function confirmerSuppression() {
    try {
      await supprimer();
      impulsion('succes');
    } catch (e) {
      setFeuille(false);
      setErreur((e as Error).message || 'La demande n’a pas pu être supprimée.');
      impulsion('erreur');
    }
  }

  if (!demande) return <Ecran>{null}</Ecran>;

  return (
    <Ecran>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: insets.bottom + 24 }}>
        <View className="mb-6 h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft dark:bg-accent-softdark">
          <Icone nom="horloge" taille={26} couleur={t.accent} />
        </View>
        <Titre>Votre demande est en cours de validation</Titre>
        <Secondaire className="mt-3">
          L’équipe Rencar vérifie les informations de votre garage. L’accès s’ouvrira ici dès que la demande sera validée.
        </Secondaire>

        <Carte className="mt-8 p-4">
          <Etiquette className="mb-2">Votre garage</Etiquette>
          <Texte className="font-semibold">{demande.garage.nom}</Texte>
          {demande.garage.adresse ? <Secondaire className="mt-0.5">{demande.garage.adresse}</Secondaire> : null}
          {demande.garage.telephone ? <Secondaire className="mt-0.5">{demande.garage.telephone}</Secondaire> : null}
          <View className="mt-4 border-t border-line pt-3 dark:border-line-dark">
            <Etiquette className="mb-1">Compte</Etiquette>
            <Secondaire>
              {`${demande.prenom} ${demande.nom}`.trim()} · {demande.email}
            </Secondaire>
          </View>
        </Carte>

        <View className="mt-8">
          <Bouton onPress={verifier} accessibilityLabel="Vérifier si la demande a été validée">
            Actualiser
          </Bouton>
          {verifie ? (
            <Legende accessibilityLiveRegion="polite" className="mt-2 text-center">
              Toujours en cours de validation.
            </Legende>
          ) : null}
          {erreur ? <Erreur className="mt-2 text-center">{erreur}</Erreur> : null}
          <Bouton variante="discret" onPress={deconnecter} className="mt-3">
            Se déconnecter
          </Bouton>
          <Bouton variante="discret" onPress={() => setFeuille(true)} accessibilityLabel="Supprimer ma demande et mon compte">
            <Texte ton="danger" className="font-semibold">
              Supprimer ma demande
            </Texte>
          </Bouton>
        </View>

        {BACKEND === 'demo' ? (
          <Legende className="mt-4 text-center">Démonstration : la demande reste sur ce téléphone, personne ne la valide.</Legende>
        ) : null}
      </ScrollView>

      <FeuilleConfirmation
        ouverte={feuille}
        onFermer={() => setFeuille(false)}
        titre="Supprimer votre demande ?"
        texte="Votre compte et votre demande sont supprimés définitivement. Vous pourrez en créer une nouvelle plus tard."
        libelle="Supprimer ma demande"
        variante="danger"
        onConfirmer={confirmerSuppression}
      />
    </Ecran>
  );
}
