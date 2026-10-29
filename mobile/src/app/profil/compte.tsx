/**
 * Mon compte : identité, e-mail de connexion, mot de passe, suppression du
 * compte avec double confirmation (feuille puis saisie de « SUPPRIMER »).
 *
 * Le dernier gérant du garage (aucun autre gérant actif ayant rejoint
 * l'équipe) peut aussi supprimer son compte (App Store 5.1.1(v)) : le garage,
 * toutes ses données et les comptes de l'équipe partent avec lui. La
 * feuille dit ce qui sera perdu, chiffres à l'appui, et rappelle qu'on peut
 * d'abord nommer un autre gérant.
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
import { estGerant } from '@/domain/permissions';
import { ecrire } from '@/lib/ecrire';
import { activerSonnerie, quitterSonnerie, synchroniserSonnerie, useTelephone } from '@/lib/sonnerie';
import { useDonnees, usePermissions, useSession } from '@/state/session';

const MOT_CLE = 'SUPPRIMER';

/** « 1 intervention », « 12 interventions » */
function nombre(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${n} ${n > 1 ? pluriel : singulier}`;
}

export default function MonCompte() {
  const insets = useSafeAreaInsets();
  const moi = useMembreCourant();
  const p = usePermissions();
  const deconnecter = useSession((s) => s.deconnecter);
  const [avis, montrerAvis] = useAvis();

  // Ce que la suppression du dernier gérant emporte (mêmes règles que supprimer_mon_compte, 0015).
  const garage = useDonnees((s) => s.garage);
  const membres = useDonnees((s) => s.membres);
  const nbInterventions = useDonnees((s) => s.interventions.length);
  const nbClients = useDonnees((s) => s.clients.length);
  const nbAppels = useDonnees((s) => s.appels.length);
  const dernierGerant =
    estGerant(moi) && !membres.some((m) => m.id !== moi.id && m.role === 'gerant' && m.actif && !m.invitationEnAttente);
  // Tous les comptes de l’équipe partent avec le garage, accès coupé compris (supprimer_garage, 0015) ;
  // une invitation en attente n’a pas encore de compte, elle est effacée avec lui.
  const autres = membres.filter((m) => m.id !== moi.id && !m.invitationEnAttente);
  const autresMembres = autres.length;
  const sansAcces = autres.filter((m) => !m.actif).length;
  const invitations = membres.filter((m) => m.id !== moi.id && m.invitationEnAttente).length;
  const precisionAcces = !sansAcces ? '' : autresMembres > 1 ? ` (dont ${sansAcces} sans accès)` : ' (accès coupé)';
  const perdu = [
    nombre(nbInterventions, 'intervention'),
    `${nombre(nbClients, 'client')} et leurs véhicules`,
    'les photos',
    ...(nbAppels ? [nombre(nbAppels, 'appel')] : []),
    ...(autresMembres ? [`le compte ${autresMembres > 1 ? `des ${autresMembres} autres membres` : 'de l’autre membre'} de l’équipe${precisionAcces}`] : []),
    ...(invitations ? [`${nombre(invitations, 'invitation')} en attente`] : []),
  ].join(', ');

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
    // Sonnerie (0016) : désinscription de ce téléphone tant que le compte existe encore (après,
    // Twilio ne pourrait plus être prévenu). Si le serveur refuse la suppression, le réglage revient.
    const sonnaitIci = useTelephone.getState().inscription === 'active';
    await quitterSonnerie();
    try {
      await repo().supprimerMonCompte({ avecGarage: dernierGerant });
    } catch (e) {
      setErreurSuppression((e as Error).message);
      setSuppression(false);
      impulsion('erreur');
      if (sonnaitIci) void activerSonnerie(moi.id);
      else void synchroniserSonnerie({ membreId: moi.id, eligible: garage.options.receptionniste && p.appels && moi.actif });
      return;
    }
    await deconnecter();
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

        <Groupe
          titre="Zone sensible"
          note={
            dernierGerant
              ? `Vous êtes le seul gérant de « ${garage.nom} » : supprimer votre compte supprime aussi le garage et toutes ses données, définitivement. Pour garder le garage, nommez d’abord un autre gérant dans Équipe.`
              : 'La suppression est définitive : votre accès au garage est retiré et vous êtes déconnecté.'
          }>
          <LigneNavigation
            titre={dernierGerant ? 'Supprimer mon compte et le garage' : 'Supprimer mon compte'}
            ton="danger"
            onPress={() => setFeuille(true)}
            derniere
          />
        </Groupe>

        {zoneOuverte ? (
          <Carte className="border-danger p-4 dark:border-danger-dark">
            <SousTitre>Dernière étape</SousTitre>
            <Secondaire className="mb-4 mt-1">
              {dernierGerant
                ? `Tapez ${MOT_CLE} pour supprimer votre compte, le garage et toutes ses données.`
                : `Tapez ${MOT_CLE} pour confirmer la suppression de votre compte.`}
            </Secondaire>
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
        titre={dernierGerant ? 'Supprimer votre compte et le garage ?' : 'Supprimer votre compte ?'}
        texte={
          dernierGerant
            ? `Seront supprimés définitivement : le garage « ${garage.nom} », ${perdu}. Rien ne pourra être récupéré. Une dernière confirmation vous sera demandée.`
            : 'Votre accès au garage est retiré immédiatement et vous êtes déconnecté. Une dernière confirmation vous sera demandée.'
        }
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
