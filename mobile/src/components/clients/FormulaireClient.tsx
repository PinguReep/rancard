/**
 * Champs d'un client (prénom, nom, téléphone, puis e-mail et mémo en mode
 * complet) avec leur validation. Contrôlé : le parent garde les valeurs.
 */

import { View } from 'react-native';

import { Champ } from '@/components/ui/champ';
import { formaterTelephone } from '@/lib/format';

import { telephoneMobileValide } from './outils';

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
            textContentType="givenName"
            autoComplete="given-name"
            placeholder="Élodie"
          />
        </View>
        <View className="flex-1">
          <Champ
            libelle="Nom"
            value={valeurs.nom}
            onChangeText={(nom) => maj({ nom })}
            erreur={erreurs.nom}
            autoCapitalize="words"
            textContentType="familyName"
            autoComplete="family-name"
            placeholder="Masson"
          />
        </View>
      </View>
      <Champ
        libelle="Mobile"
        type="telephone"
        value={valeurs.telephone}
        onChangeText={(telephone) => maj({ telephone })}
        onBlur={() => maj({ telephone: formaterTelephone(valeurs.telephone) })}
        erreur={erreurs.telephone}
        aide={complet ? undefined : 'Sert aux SMS « véhicule prêt ».'}
        placeholder="06 39 98 00 11"
        returnKeyType={complet ? undefined : 'done'}
        onSubmitEditing={complet ? undefined : onSubmit}
      />
      {complet ? (
        <>
          <Champ
            libelle="E-mail (facultatif)"
            type="email"
            value={valeurs.email}
            onChangeText={(email) => maj({ email })}
            erreur={erreurs.email}
            placeholder="prenom@garage.example"
          />
          <Champ
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
