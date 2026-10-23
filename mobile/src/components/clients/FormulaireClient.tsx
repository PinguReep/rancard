/**
 * Champs d'un client (prénom, nom, téléphone, puis e-mail et mémo en mode
 * complet) avec leur validation. Contrôlé : le parent garde les valeurs.
 */

import { useRef } from 'react';
import { View, type TextInput } from 'react-native';

import { Champ } from '@/components/ui/champ';
import { formaterTelephone } from '@/lib/format';

import { chiffresTelephone, telephoneMobileValide } from './outils';

export type ValeursClient = { prenom: string; nom: string; telephone: string; email: string; memo: string };

export const CLIENT_VIDE: ValeursClient = { prenom: '', nom: '', telephone: '', email: '', memo: '' };

export type ErreursClient = Partial<Record<keyof ValeursClient, string>>;

export function validerClient(v: ValeursClient): ErreursClient {
  const e: ErreursClient = {};
  if (!v.prenom.trim()) e.prenom = 'Le prénom est nécessaire.';
  if (!v.nom.trim()) e.nom = 'Le nom est nécessaire.';
  if (!v.telephone.trim()) e.telephone = 'Le numéro de mobile est nécessaire.';
  else if (!telephoneMobileValide(v.telephone)) e.telephone = 'Numéro de mobile attendu (06 ou 07), pour les SMS.';
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Adresse e-mail incomplète.';
  return e;
}

/** Valeurs prêtes pour le dépôt (téléphone mis en forme, champs vides omis). */
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
            libelle="Prénom"
            value={valeurs.prenom}
            onChangeText={(prenom) => maj({ prenom })}
            erreur={erreurs.prenom}
            autoFocus={autoFocus}
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="givenName"
            autoComplete="given-name"
            placeholder="Élodie"
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
            placeholder="Masson"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => champMobile.current?.focus()}
          />
        </View>
      </View>
      <Champ
        ref={champMobile}
        libelle="Mobile"
        type="telephone"
        value={valeurs.telephone}
        onChangeText={saisirTelephone}
        onBlur={() => maj({ telephone: formaterTelephone(valeurs.telephone) })}
        erreur={erreurs.telephone}
        aide={complet ? undefined : 'Sert aux SMS « véhicule prêt ».'}
        placeholder="06 39 98 00 11"
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
