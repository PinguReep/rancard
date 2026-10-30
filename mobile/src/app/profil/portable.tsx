/**
 * Appels sur mon portable (profil) : « Recevoir les appels transférés sur
 * mon portable ». Quand le réceptionniste passe un appel à l’équipe, Twilio
 * compose le portable des membres qui l’ont accepté, sur le réseau
 * téléphonique classique (version 1 de Rencar, migration 0019) : annonce,
 * appui sur 1, mise en relation avec le client. Le premier qui prend l’appel
 * parle au client ; sans appui, la messagerie du membre ne capte jamais
 * l’appel.
 *
 * Le membre règle lui-même son numéro et son accord (désactivé par défaut).
 * Le numéro ne sert qu’à ces transferts : le gérant voit seulement qui reçoit
 * les appels, jamais le numéro. Portables français seulement (06, 07).
 *
 * Ouvert au gérant et aux membres qui ont la permission « appels », quand la
 * prestation réceptionniste est souscrite ; sinon l’état « Non inclus ».
 * Même écran dans Rencar et dans Rencar Test (où la sonnerie dans l’app reste
 * à côté, dans le profil).
 */

import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avis, useAvis } from '@/components/intervention/Avis';
import { LigneInterrupteur } from '@/components/profil/LigneInterrupteur';
import { useMembreCourant } from '@/components/profil/useMembreCourant';
import { Bouton, Carte, Champ, Ecran, Groupe, Legende, Section, Texte, Vide, impulsion } from '@/components/ui';
import { BACKEND, repo, type TransfertPortable } from '@/data';
import { peut } from '@/domain/permissions';
import { MESSAGE_PORTABLE_ABSENT, MESSAGE_PORTABLE_INVALIDE, portableAffiche, portableFrancais } from '@/domain/portable';
import { NON_INCLUS } from '@/domain/prestations';
import { numeroAffiche } from '@/domain/renvoi';
import { useDonnees } from '@/state/session';
import { useTheme } from '@/theme/tokens';

type Chargement = { etat: 'chargement' } | { etat: 'pret' } | { etat: 'erreur'; message: string };

/** Valeur du champ : « 06 39 98 00 11 » avec des espaces ordinaires (plus simple à corriger au clavier). */
const enSaisie = (numero: string | null) => (numero ? portableAffiche(numero).replace(/ /g, ' ') : '');

export default function AppelsSurMonPortable() {
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const moi = useMembreCourant();
  const garage = useDonnees((s) => s.garage);
  const [avis, montrerAvis] = useAvis();
  const champ = useRef<TextInput>(null);

  const [chargement, setChargement] = useState<Chargement>({ etat: 'chargement' });
  const [enregistre, setEnregistre] = useState<TransfertPortable>({ numero: null, accepte: false });
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [numeroGarage, setNumeroGarage] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);

  const autorise = garage.options.receptionniste && peut(moi, 'appels');

  useEffect(() => {
    if (!autorise) return;
    let actif = true;
    repo()
      .transfertPortable()
      .then(
        (r) => {
          if (!actif) return;
          setEnregistre(r);
          setSaisie(enSaisie(r.numero));
          setChargement({ etat: 'pret' });
        },
        (e: unknown) => {
          if (actif) setChargement({ etat: 'erreur', message: (e as Error)?.message || 'Réglage illisible pour le moment.' });
        },
      );
    // Le numéro présenté sur le portable : celui de Rencar (0017), s’il est attribué.
    repo()
      .renvoiReceptionniste()
      .then(
        (r) => {
          if (actif) setNumeroGarage(r?.numero ?? null);
        },
        () => undefined,
      );
    return () => {
      actif = false;
    };
  }, [autorise, essai]);

  if (!garage.options.receptionniste) {
    return (
      <Ecran sansHaut>
        <Stack.Screen options={{ title: 'Appels sur mon portable' }} />
        <Vide icone="cadenas" titre="Appels sur mon portable" texte={NON_INCLUS} />
      </Ecran>
    );
  }
  if (!peut(moi, 'appels')) {
    return (
      <Ecran sansHaut>
        <Stack.Screen options={{ title: 'Appels sur mon portable' }} />
        <Vide icone="cadenas" titre="Réservé aux appels" texte="Les appels transférés sont réservés au gérant et aux membres qui traitent les appels." />
      </Ecran>
    );
  }

  const normalise = portableFrancais(saisie);
  const numeroChange = (normalise ?? saisie.trim()) !== (enregistre.numero ?? '');

  async function enregistrer(accepte: boolean, numero: string | null, message: string) {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await repo().reglerTransfertPortable({ numero, accepte });
      setEnregistre(r);
      setSaisie(enSaisie(r.numero));
      impulsion('succes');
      montrerAvis(message);
    } catch (e) {
      impulsion('erreur');
      const texte = (e as Error)?.message || 'L’enregistrement n’a pas abouti. Réessayez.';
      // Un refus du numéro s’affiche sous le champ ; les autres en avis.
      if (texte === MESSAGE_PORTABLE_INVALIDE || texte === MESSAGE_PORTABLE_ABSENT) setErreur(texte);
      else montrerAvis(texte);
    } finally {
      setEnCours(false);
    }
  }

  function changerAccord(v: boolean) {
    if (enCours) return;
    if (v) {
      if (!saisie.trim()) {
        setErreur(MESSAGE_PORTABLE_ABSENT);
        champ.current?.focus();
        return;
      }
      if (!normalise) {
        setErreur(MESSAGE_PORTABLE_INVALIDE);
        champ.current?.focus();
        return;
      }
      void enregistrer(true, normalise, 'Appels transférés activés');
      return;
    }
    // Désactiver garde le numéro enregistré (pas celui en cours de saisie).
    void enregistrer(false, enregistre.numero, 'Appels transférés désactivés');
  }

  async function enregistrerNumero() {
    if (!normalise) {
      setErreur(saisie.trim() ? MESSAGE_PORTABLE_INVALIDE : MESSAGE_PORTABLE_ABSENT);
      impulsion('erreur');
      return;
    }
    await enregistrer(enregistre.accepte, normalise, 'Numéro enregistré');
  }

  const accepte = enregistre.accepte;
  const garageNom = garage.nom.trim() || 'votre garage';
  const aide =
    chargement.etat === 'chargement'
      ? 'Lecture du réglage…'
      : accepte
        ? `Activé sur le ${portableAffiche(enregistre.numero)}.${BACKEND === 'demo' ? ' Démonstration : aucun appel ne part.' : ''}`
        : 'Désactivé : votre portable ne reçoit aucun appel transféré.';

  return (
    <Ecran sansHaut>
      <Stack.Screen options={{ title: 'Appels sur mon portable' }} />
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="automatic">
        <Carte className="mb-6 p-4">
          <Texte>
            {'Quand un client demande à parler à quelqu’un, pendant les heures d’ouverture, le réceptionniste appelle les portables de l’équipe qui ont activé ce réglage. Le premier qui prend l’appel parle au client.'}
          </Texte>
          <Legende className="mt-2">
            {`Vous entendez « Appel client transféré par le réceptionniste de ${garageNom} », puis vous appuyez sur 1 pour prendre l’appel. Sans appui, l’appel n’est pas pris sur votre portable : votre messagerie ne le prend jamais.`}
          </Legende>
        </Carte>

        {chargement.etat === 'erreur' ? (
          <Carte className="mb-6 p-4">
            <Texte>{chargement.message}</Texte>
            <Bouton
              compact
              variante="secondaire"
              className="mt-3 self-start"
              accessibilityLabel="Relire le réglage"
              onPress={() => {
                setChargement({ etat: 'chargement' });
                setEssai((n) => n + 1);
              }}>
              Réessayer
            </Bouton>
          </Carte>
        ) : null}

        <Groupe
          note={
            numeroGarage
              ? `Numéro qui s’affiche sur votre portable : ${numeroAffiche(numeroGarage)}, le numéro Rencar du garage. Enregistrez-le dans vos contacts pour reconnaître ces appels.`
              : 'Le numéro qui s’affiche sur votre portable est le numéro Rencar du garage.'
          }>
          <LigneInterrupteur
            titre="Recevoir les appels transférés sur mon portable"
            aide={enCours ? 'Enregistrement…' : aide}
            valeur={accepte}
            desactive={chargement.etat !== 'pret' || enCours}
            onChange={changerAccord}
            derniere
          />
        </Groupe>
        {chargement.etat === 'chargement' ? (
          <View className="mb-4 items-center">
            <ActivityIndicator color={t.muted} accessibilityLabel="Lecture du réglage" />
          </View>
        ) : null}

        <Section titre="Mon portable">
          <Champ
            ref={champ}
            libelle="Numéro de portable"
            type="telephone"
            value={saisie}
            onChangeText={(v) => {
              setSaisie(v);
              if (erreur) setErreur(null);
            }}
            placeholder="06 39 98 00 11"
            editable={chargement.etat === 'pret' && !enCours}
            erreur={erreur}
            aide={'Portable français, en 06 ou en 07. Il ne sert qu’à ces transferts : ni le gérant, ni vos collègues, ni les clients ne le voient.'}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (numeroChange) void enregistrerNumero();
            }}
            className="mb-3"
          />
          {numeroChange && chargement.etat === 'pret' ? (
            <Bouton onPress={enregistrerNumero} chargement={enCours} accessibilityLabel="Enregistrer le numéro de portable">
              Enregistrer le numéro
            </Bouton>
          ) : null}
          {enregistre.numero && !numeroChange ? (
            <Bouton
              variante="discret"
              className="self-start"
              desactive={enCours}
              accessibilityLabel="Retirer mon numéro de portable de Rencar"
              onPress={() => enregistrer(false, null, 'Numéro retiré')}>
              Retirer mon numéro
            </Bouton>
          ) : null}
        </Section>
        <Legende className="ml-1">Vous pouvez désactiver ce réglage ou retirer votre numéro à tout moment. Il est effacé si votre accès au garage est coupé.</Legende>
      </KeyboardAwareScrollView>
      <Avis texte={avis} flottant />
    </Ecran>
  );
}
