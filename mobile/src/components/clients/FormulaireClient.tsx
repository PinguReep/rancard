/**
 * Champs d'un client (prénom, nom, téléphone, puis e-mail et mémo en mode
 * complet) avec leur validation. Contrôlé : le parent garde les valeurs.
 *
 * Mobile facultatif (v2c, D6) : vide, la fiche portera « Mobile à
 * compléter » ; un fixe est accepté (pas de SMS possible) ; un numéro
 * inventé (« 06 39 98 00 10 », « 06 39 98 00 11 ») est refusé, pour
 * qu'aucun lien de suivi ne parte chez un inconnu.
 */

import { useRef } from 'react';
import { View, type TextInput } from 'react-native';

import { Champ } from '@/components/ui/champ';
import { formaterTelephone } from '@/lib/format';

import { chiffresTelephone, numeroInvente, telephoneFixeValide, telephoneMobileValide } from './outils';

export type ValeursClient = { prenom: string; nom: string; telephone: string; email: string; memo: string };

export const CLIENT_VIDE: ValeursClient = { prenom: '', nom: '', telephone: '', email: '', memo: '' };

export type ErreursClient = Partial<Record<keyof ValeursClient, string>>;

/** Refus d'un numéro inventé (D6). */
export const ERREUR_NUMERO_INVENTE = 'Ce numéro ressemble à un numéro inventé. Laissez le champ vide : la fiche restera « à compléter ».';

/** Légende d'un numéro fixe accepté. */
export const LEGENDE_NUMERO_FIXE = 'Numéro fixe : pas de SMS possible.';
/** Numéro étranger (l’appelant d’un réceptionniste, par exemple) : on l’appelle, les SMS partent vers un mobile français. */
export const LEGENDE_NUMERO_ETRANGER = 'Numéro étranger : appel possible, pas de SMS.';

/**
 * Ce que dit le numéro saisi : rien (vide, accepté), un mobile, un fixe
 * (accepté sans SMS), un numéro inventé ou un format inconnu (refusés).
 */
export function natureTelephone(saisie: string): 'vide' | 'mobile' | 'fixe' | 'invente' | 'invalide' {
  if (!saisie.trim()) return 'vide';
  if (numeroInvente(saisie)) return 'invente';
  if (telephoneMobileValide(saisie)) return 'mobile';
  if (telephoneFixeValide(saisie)) return 'fixe';
  return 'invalide';
}

export function validerClient(v: ValeursClient): ErreursClient {
  const e: ErreursClient = {};
  // Prénom facultatif (M. Arnaud, voiture de la boîte à clés) : le nom suffit, le SMS dit « Bonjour, ».
  if (!v.nom.trim()) e.nom = 'Le nom est nécessaire.';
  const nature = natureTelephone(v.telephone);
  if (nature === 'invente') e.telephone = ERREUR_NUMERO_INVENTE;
  else if (nature === 'invalide') e.telephone = 'Numéro attendu : mobile (06 ou 07) ou fixe (01 à 05, 09). Inconnu : laissez le champ vide.';
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Adresse e-mail incomplète.';
  return e;
}

/** Valeurs prêtes pour le dépôt (téléphone mis en forme, vide si inconnu, champs vides omis). */
export function versClient(v: ValeursClient): { prenom: string; nom: string; telephone: string; email?: string; memo?: string } {
  return {
    prenom: v.prenom.trim(),
    nom: v.nom.trim(),
    telephone: formaterTelephone(v.telephone),
    email: v.email.trim() || undefined,
    memo: v.memo.trim() || undefined,
  };
}

type Props = {
  valeurs: ValeursClient;
  onChange: (v: ValeursClient) => void;
  erreurs: ErreursClient;
  /** true = e-mail et mémo en plus des trois champs de base */
  complet?: boolean;
  autoFocus?: boolean;
  /** Validation clavier sur le dernier champ */
  onSubmit?: () => void;
};

export function FormulaireClient({ valeurs, onChange, erreurs, complet, autoFocus, onSubmit }: Props) {
  const maj = (patch: Partial<ValeursClient>) => onChange({ ...valeurs, ...patch });
  // Enchaînement au clavier : Prénom → Nom → Mobile → E-mail → Mémo.
  const champNom = useRef<TextInput>(null);
  const champMobile = useRef<TextInput>(null);
  const champEmail = useRef<TextInput>(null);
  const champMemo = useRef<TextInput>(null);

  function saisirTelephone(telephone: string) {
    // Le pavé téléphone n'a pas de touche Entrée : le dixième chiffre passe à l'e-mail.
    const termine = chiffresTelephone(telephone).length === 10 && chiffresTelephone(valeurs.telephone).length < 10;
    if (!complet || !termine) {
      maj({ telephone });
      return;
    }
    maj({ telephone: formaterTelephone(telephone) });
    // Après le rendu : le blur du mobile lit alors le numéro complet.
    setTimeout(() => champEmail.current?.focus(), 0);
  }

  return (
    <View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Champ
            libelle="Prénom (facultatif)"
            value={valeurs.prenom}
            onChangeText={(prenom) => maj({ prenom })}
            erreur={erreurs.prenom}
            autoFocus={autoFocus}
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="givenName"
            autoComplete="given-name"
            placeholder="Ex. Camille"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => champNom.current?.focus()}
          />
        </View>
        <View className="flex-1">
          <Champ
            ref={champNom}
            libelle="Nom"
            value={valeurs.nom}
            onChangeText={(nom) => maj({ nom })}
            erreur={erreurs.nom}
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="familyName"
            autoComplete="family-name"
            placeholder="Ex. Dupont"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => champMobile.current?.focus()}
          />
        </View>
      </View>
      <Champ
        ref={champMobile}
        libelle="Mobile (facultatif)"
        type="telephone"
        value={valeurs.telephone}
        onChangeText={saisirTelephone}
        onBlur={() => maj({ telephone: formaterTelephone(valeurs.telephone) })}
        erreur={erreurs.telephone}
        aide={
          natureTelephone(valeurs.telephone) === 'fixe'
            ? LEGENDE_NUMERO_FIXE
            : complet
              ? undefined
              : 'Sert aux SMS « véhicule prêt ». Inconnu : laissez vide, la fiche restera « à compléter ».'
        }
        placeholder="06 ou 07…"
        returnKeyType={complet ? 'next' : 'done'}
        submitBehavior={complet ? 'submit' : undefined}
        onSubmitEditing={complet ? () => champEmail.current?.focus() : onSubmit}
      />
      {complet ? (
        <>
          <Champ
            ref={champEmail}
            libelle="E-mail (facultatif)"
            type="email"
            value={valeurs.email}
            onChangeText={(email) => maj({ email })}
            erreur={erreurs.email}
            placeholder="prenom@garage.example"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => champMemo.current?.focus()}
          />
          <Champ
            ref={champMemo}
            libelle="Mémo interne"
            type="multiligne"
            value={valeurs.memo}
            onChangeText={(memo) => maj({ memo })}
            aide="Un rappel utile pour l’équipe, jamais montré au client."
            placeholder="Passe récupérer entre 14h et 15h…"
          />
        </>
      ) : null}
    </View>
  );
}
