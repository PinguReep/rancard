/**
 * Étape 3 : la prestation, la demande du client, le créneau, la durée, le
 * mécanicien, la priorité, le mémo interne et le montant estimé. Tout se
 * choisit par puces, la saisie libre reste possible.
 */

import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ScrollView, Switch, View, type TextInput } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { Groupe, Ligne } from '@/components/ui/carte';
import { Champ } from '@/components/ui/champ';
import { impulsion } from '@/components/ui/haptique';
import { Erreur, Etiquette, Legende, Secondaire, Texte } from '@/components/ui/texte';
import type { Garage, Membre } from '@/domain/types';
import { useTheme } from '@/theme/tokens';

import { DUREES, PRESTATIONS, creneauxDuJour, horairesRenseignes, joursProchains } from './creneaux';
import { Puce, Puces } from './Puce';

export type ValeursIntervention = {
  prestation: string;
  demande: string;
  /** Clé du jour choisi (yyyy-MM-dd) */
  jour: string;
  /** Début du créneau, ISO, null tant que rien n'est choisi */
  creneau: string | null;
  dureeMin: number;
  membreId: string | null;
  prioritaire: boolean;
  memo: string;
  /** Saisie brute du montant, convertie à l'enregistrement */
  montant: string;
};

export type ErreursIntervention = Partial<Record<'prestation' | 'creneau' | 'montant', string>>;

type Props = {
  valeurs: ValeursIntervention;
  /** Mise à jour fonctionnelle : deux changements dans le même rendu ne s'écrasent pas */
  onChange: Dispatch<SetStateAction<ValeursIntervention>>;
  erreurs: ErreursIntervention;
  garage: Garage;
  membres: Membre[];
  voirPrix: boolean;
  /** « Plus tard » (sans mécanicien) : seulement pour qui voit tout le planning */
  plusTard?: boolean;
};

export function EtapeIntervention({ valeurs, onChange, erreurs, garage, membres, voirPrix, plusTard = true }: Props) {
  const t = useTheme();
  const maj = (patch: Partial<ValeursIntervention>) => onChange((v) => ({ ...v, ...patch }));
  const champPrestation = useRef<TextInput>(null);

  const jours = useMemo(() => joursProchains(garage.horaires), [garage.horaires]);
  const jourChoisi = jours.find((j) => j.cle === valeurs.jour) ?? jours[0];
  const creneaux = useMemo(() => creneauxDuJour(jourChoisi.date, garage.horaires), [jourChoisi.date, garage.horaires]);
  const creneauxAVenir = creneaux.filter((c) => !c.passe);
  const sansHoraires = !horairesRenseignes(garage.horaires);
  const prestationLibre = valeurs.prestation.trim() !== '' && !(PRESTATIONS as readonly string[]).includes(valeurs.prestation.trim());
  // « Autre » reste sélectionnée après l'appui, le temps de saisir la prestation.
  const [autre, setAutre] = useState(prestationLibre);

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      {/* Prestation */}
      <Champ
        ref={champPrestation}
        libelle="Prestation"
        value={valeurs.prestation}
        onChangeText={(prestation) => maj({ prestation })}
        erreur={erreurs.prestation}
        placeholder="Vidange + filtres"
        autoCapitalize="sentences"
        className="mb-3"
      />
      <View className="mb-6">
        <Puces>
          {PRESTATIONS.map((p) => (
            <Puce
              key={p}
              label={p}
              active={valeurs.prestation.trim() === p}
              onPress={() => {
                setAutre(false);
                maj({ prestation: p });
              }}
            />
          ))}
          <Puce
            label="Autre"
            active={autre || prestationLibre}
            onPress={() => {
              setAutre(true);
              maj({ prestation: '' });
              champPrestation.current?.focus();
            }}
            accessibilityLabel="Autre prestation, saisie libre"
          />
        </Puces>
      </View>

      <Champ
        libelle="Demande du client (facultatif)"
        type="multiligne"
        value={valeurs.demande}
        onChangeText={(demande) => maj({ demande })}
        placeholder="Bruit au freinage depuis une semaine…"
        className="mb-6"
      />

      {/* Rendez-vous */}
      <Etiquette accessibilityRole="header" className="mb-2 ml-1">
        Rendez-vous
      </Etiquette>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4" contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {jours.map((j) => (
          <Puce
            key={j.cle}
            label={j.label}
            active={j.cle === jourChoisi.cle}
            desactivee={j.ferme}
            accessibilityLabel={j.ferme ? `${j.label}, fermé` : j.label}
            onPress={() => maj({ jour: j.cle, creneau: null })}
          />
        ))}
      </ScrollView>
      <View className="mt-3 mb-6">
        {jourChoisi.ferme ? (
          <Legende className="ml-1">Le garage est fermé ce jour.</Legende>
        ) : creneauxAVenir.length === 0 ? (
          <Legende className="ml-1">Plus de créneau aujourd’hui, choisissez un autre jour.</Legende>
        ) : (
          <Puces>
            {creneaux.map((c) => (
              <Puce
                key={c.iso}
                label={c.label}
                active={valeurs.creneau === c.iso}
                desactivee={c.passe}
                accessibilityLabel={c.passe ? `${c.label}, passé` : c.label}
                onPress={() => maj({ creneau: c.iso })}
              />
            ))}
          </Puces>
        )}
        {sansHoraires ? <Legende className="ml-1 mt-2">Horaires non renseignés dans « Le garage » : créneaux proposés de 8h à 18h.</Legende> : null}
        {erreurs.creneau ? <Erreur className="mt-2 ml-1">{erreurs.creneau}</Erreur> : null}
      </View>

      {/* Durée */}
      <Etiquette accessibilityRole="header" className="mb-2 ml-1">
        Durée prévue
      </Etiquette>
      <View className="mb-6">
        <Puces>
          {DUREES.map((d) => (
            <Puce key={d.min} label={d.label} active={valeurs.dureeMin === d.min} onPress={() => maj({ dureeMin: d.min })} />
          ))}
        </Puces>
      </View>

      {/* Mécanicien */}
      <Etiquette accessibilityRole="header" className="mb-2 ml-1">
        Mécanicien
      </Etiquette>
      <View className="mb-6">
        <Puces>
          {plusTard ? <Puce label="Plus tard" active={valeurs.membreId === null} onPress={() => maj({ membreId: null })} /> : null}
          {membres.map((m) => (
            <Puce
              key={m.id}
              label={m.prenom}
              active={valeurs.membreId === m.id}
              onPress={() => maj({ membreId: m.id })}
              icone={<Avatar membre={m} taille={22} />}
              accessibilityLabel={`${m.prenom} ${m.nom}`}
            />
          ))}
        </Puces>
      </View>

      {/* Priorité */}
      <Groupe>
        <Ligne derniere>
          <View className="flex-1">
            <Texte>Prioritaire</Texte>
            <Secondaire>Passe en tête du planning.</Secondaire>
          </View>
          <Switch
            value={valeurs.prioritaire}
            onValueChange={(prioritaire) => {
              impulsion('leger');
              maj({ prioritaire });
            }}
            trackColor={{ true: t.accentFond, false: t.line }}
        thumbColor={t.blanc}
        {...({ activeThumbColor: t.blanc } as object)}
            ios_backgroundColor={t.line}
            accessibilityLabel="Prioritaire"
          />
        </Ligne>
      </Groupe>

      <Champ
        libelle="Mémo interne (facultatif)"
        type="multiligne"
        value={valeurs.memo}
        onChangeText={(memo) => maj({ memo })}
        placeholder="Clé sous le pare-soleil, client joignable après 17h…"
        aide="Visible de l’équipe seulement."
      />

      {voirPrix ? (
        <Champ
          libelle="Montant estimé (facultatif)"
          type="nombre"
          value={valeurs.montant}
          onChangeText={(montant) => maj({ montant })}
          erreur={erreurs.montant}
          placeholder="149"
          aide="En euros, ordre de grandeur pour le client."
        />
      ) : null}
    </Animated.View>
  );
}
