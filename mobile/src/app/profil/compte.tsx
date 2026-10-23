/**
 * Mon compte : identité, e-mail de connexion, mot de passe, suppression du
 * compte avec double confirmation (feuille puis saisie de « SUPPRIMER »).
 */

import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avis, useAvis } from '@/components/intervention/Avis';
import { LigneNavigation } from '@/components/profil/LigneNavigation';
import { useMembreCourant } from '@/components/profil/useMembreCourant';
import { Bouton, Carte, Champ, Ecran, Erreur, FeuilleConfirmation, Groupe, Legende, Ligne, Secondaire, Section, SousTitre, impulsion } from '@/components/ui';
import { BACKEND, repo } from '@/data';
import { ecrire } from '@/lib/ecrire';
import { useSession } from '@/state/session';

const MOT_CLE = 'SUPPRIMER';

export default function MonCompte() {
  const insets = useSafeAreaInsets();
  const moi = useMembreCourant();
  const deconnecter = useSession((s) => s.deconnecter);
  const [avis, montrerAvis] = useAvis();

  const [prenom, setPrenom] = useState(moi.prenom);
  const [nom, setNom] = useState(moi.nom);

  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreurMdp, setErreurMdp] = useState<string | null>(null);
  const [mdpChange, setMdpChange] = useState(false);
  const [chargementMdp, setChargementMdp] = useState(false);
  const champNouveau = useRef<TextInput>(null);
  const champConfirmation = useRef<TextInput>(null);

  const [feuille, setFeuille] = useState(false);
  const [zoneOuverte, setZoneOuverte] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [suppression, setSuppression] = useState(false);
  const [erreurSuppression, setErreurSuppression] = useState<string | null>(null);
  const champSaisie = useRef<TextInput>(null);

  // La saisie apparaît pendant que la feuille se ferme : `autoFocus` la rend
  // visible, et ce second focus la rattrape si iOS rend la main au clavier
  // seulement après la disparition de la feuille.
  useEffect(() => {
    if (!zoneOuverte) return;
    const minuteur = setTimeout(() => {
      champSaisie.current?.focus();
    }, 400);
    return () => {
      clearTimeout(minuteur);
    };
  }, [zoneOuverte]);

  function enregistrerIdentite() {
    const p = prenom.trim();
    const n = nom.trim();
    if (!p || !n) {
      setPrenom(moi.prenom);
      setNom(moi.nom);
      return;
    }
    if (p !== moi.prenom || n !== moi.nom) {
      impulsion();
      ecrire(repo().modifierMembre(moi.id, { prenom: p, nom: n }), montrerAvis, 'Le nom n’a pas pu être enregistré.');
    }
  }

  async function changerMotDePasse() {
    setErreurMdp(null);
    setMdpChange(false);
    if (!actuel) {
      setErreurMdp('Indiquez votre mot de passe actuel.');
      return;
    }
    if (nouveau.length < 8) {
      setErreurMdp('Le nouveau mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (nouveau !== confirmation) {
      setErreurMdp('Les deux saisies ne correspondent pas.');
      return;
    }
    setChargementMdp(true);
    try {
      await repo().changerMotDePasse(actuel, nouveau);
      setActuel('');
      setNouveau('');
      setConfirmation('');
      setMdpChange(true);
      impulsion('succes');
    } catch (e) {
      setErreurMdp((e as Error).message);
      impulsion('erreur');
    } finally {
      setChargementMdp(false);
    }
  }

  async function supprimerCompte() {
    if (saisie.trim().toUpperCase() !== MOT_CLE) return;
    setSuppression(true);
    setErreurSuppression(null);
    try {
      await repo().supprimerMonCompte();
      await deconnecter();
    } catch (e) {
      setErreurSuppression((e as Error).message);
      setSuppression(false);
      impulsion('erreur');
    }
  }

  return (
    <Ecran sansHaut>
      <Stack.Screen options={{ title: 'Mon compte' }} />
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="automatic">
        <Section titre="Identité">
          <Champ libelle="Prénom" value={prenom} onChangeText={setPrenom} onBlur={enregistrerIdentite} autoComplete="given-name" textContentType="givenName" autoCapitalize="words" />
          <Champ libelle="Nom" value={nom} onChangeText={setNom} onBlur={enregistrerIdentite} autoComplete="family-name" textContentType="familyName" autoCapitalize="words" className="mb-0" />
        </Section>

        <Groupe titre="Connexion" note="L’adresse e-mail sert à la connexion et ne se modifie pas ici.">
          <LigneNavigation titre="E-mail" valeur={moi.email} derniere />
        </Groupe>

        {BACKEND === 'demo' ? (
          <Groupe titre="Mot de passe">
            <Ligne derniere>
              <Secondaire>Pas de mot de passe en démonstration.</Secondaire>
            </Ligne>
          </Groupe>
        ) : (
          <Section titre="Mot de passe">
            <Champ
              libelle="Mot de passe actuel"
              type="motdepasse"
              value={actuel}
              onChangeText={setActuel}
              textContentType="password"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => champNouveau.current?.focus()}
            />
            <Champ
              ref={champNouveau}
              libelle="Nouveau mot de passe"
              type="motdepasse"
              value={nouveau}
              onChangeText={setNouveau}
              textContentType="newPassword"
              autoComplete="new-password"
              aide="Au moins 8 caractères."
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => champConfirmation.current?.focus()}
            />
            <Champ
              ref={champConfirmation}
              libelle="Confirmer le nouveau mot de passe"
              type="motdepasse"
              value={confirmation}
              onChangeText={setConfirmation}
              textContentType="newPassword"
              autoComplete="new-password"
              erreur={erreurMdp}
              returnKeyType="done"
              onSubmitEditing={changerMotDePasse}
            />
            <Bouton onPress={changerMotDePasse} chargement={chargementMdp} desactive={!actuel || !nouveau || !confirmation}>
              Changer le mot de passe
            </Bouton>
            {mdpChange ? <Legende className="mt-2 text-center">Mot de passe changé.</Legende> : null}
          </Section>
        )}

        <Groupe titre="Zone sensible" note="La suppression est définitive : votre accès au garage est retiré et vous êtes déconnecté.">
          <LigneNavigation titre="Supprimer mon compte" ton="danger" onPress={() => setFeuille(true)} derniere />
        </Groupe>

        {zoneOuverte ? (
          <Carte className="border-danger p-4 dark:border-danger-dark">
            <SousTitre>Dernière étape</SousTitre>
            <Secondaire className="mb-4 mt-1">Tapez {MOT_CLE} pour confirmer la suppression de votre compte.</Secondaire>
            <Champ
              ref={champSaisie}
              libelle={`Tapez ${MOT_CLE}`}
              type="plaque"
              value={saisie}
              onChangeText={setSaisie}
              placeholder={MOT_CLE}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={supprimerCompte}
            />
            {erreurSuppression ? <Erreur className="mb-3 ml-1">{erreurSuppression}</Erreur> : null}
            <Bouton variante="danger" onPress={supprimerCompte} chargement={suppression} desactive={saisie.trim().toUpperCase() !== MOT_CLE}>
              Supprimer définitivement
            </Bouton>
            <Bouton
              variante="discret"
              className="mt-2"
              desactive={suppression}
              onPress={() => {
                setZoneOuverte(false);
                setSaisie('');
              }}>
              Annuler
            </Bouton>
          </Carte>
        ) : null}
      </KeyboardAwareScrollView>

      <FeuilleConfirmation
        ouverte={feuille}
        onFermer={() => setFeuille(false)}
        titre="Supprimer votre compte ?"
        texte="Votre accès au garage est retiré immédiatement et vous êtes déconnecté. Une dernière confirmation vous sera demandée."
        libelle="Continuer"
        variante="danger"
        onConfirmer={() => {
          setFeuille(false);
          setSaisie('');
          setZoneOuverte(true);
        }}
      />
      <Avis texte={avis} />
    </Ecran>
  );
}
