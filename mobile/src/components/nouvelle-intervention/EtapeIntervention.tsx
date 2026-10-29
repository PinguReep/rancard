/**
 * Étape 3, dans l'ordre du comptoir : la prestation, le mécanicien (visible
 * sans défiler), puis « Quand ? » : la puce « Déjà au garage » en tête
 * (dépôt sans rendez-vous, arrivée à l'heure réelle, kilométrage relevé),
 * sinon le jour (J à J+6, « Autre date… » au-delà) et le créneau ; dans les
 * deux cas le retour prévu. Ensuite la durée, la demande du client, la
 * priorité, le mémo interne et le montant estimé : rien n'est replié.
 * Tout se choisit par puces, la saisie libre reste possible.
 */

import { format, isSameDay, isToday, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Switch, View, type TextInput } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { Groupe, Ligne } from '@/components/ui/carte';
import { Champ } from '@/components/ui/champ';
import { FeuilleDate } from '@/components/ui/feuille-date';
import { impulsion } from '@/components/ui/haptique';
import { Icone } from '@/components/ui/icone';
import { PucesHeures, PucesJours, libelleJourPuce } from '@/components/ui/puces-quand';
import { Erreur, Etiquette, Legende, Secondaire, Texte } from '@/components/ui/texte';
import { aideReleveRepris } from '@/domain/echeances';
import type { Garage, Membre } from '@/domain/types';
import { heure, kilometrage } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

import {
  DUREES,
  PRESTATIONS,
  aHeureIso,
  arriveeMaintenant,
  cleJour,
  creneauxDuJour,
  fermetureDu,
  heuresRetour,
  horairesRenseignes,
  jourDeCle,
  jourOuvertSuivant,
  joursProchains,
  premierCreneauLibre,
} from './creneaux';
import { Puce, Puces } from './Puce';

export type ValeursIntervention = {
  prestation: string;
  demande: string;
  /** Clé du jour choisi (yyyy-MM-dd), au-delà de J+6 compris */
  jour: string;
  /** Début du créneau, ISO, null tant que rien n'est choisi */
  creneau: string | null;
  dureeMin: number;
  membreId: string | null;
  prioritaire: boolean;
  memo: string;
  /** Saisie brute du montant, convertie à l'enregistrement */
  montant: string;
  /** La voiture est déjà là : arrivée maintenant, création puis réception (« Ajouter et réceptionner ») */
  dejaAuGarage: boolean;
  /** Retour prévu (ISO), null = « À définir » */
  retour: string | null;
  /** Kilométrage relevé au dépôt, saisie brute ; seulement avec « Déjà au garage » */
  km: string;
  /** Dernier relevé repris dans `km` (D7) : remplacé si le véhicule change tant qu’on n’y a pas touché */
  kmRepris: string;
};

export type ErreursIntervention = Partial<Record<'prestation' | 'creneau' | 'km' | 'montant', string>>;

/** Blocs qui peuvent porter une erreur, dans l'ordre de l'écran. */
export type BlocIntervention = keyof ErreursIntervention;
export const ORDRE_BLOCS: BlocIntervention[] = ['prestation', 'creneau', 'km', 'montant'];

/** Début effectif de l'intervention : l'arrivée (« Déjà au garage ») ou le créneau choisi. */
export function debutDe(v: Pick<ValeursIntervention, 'dejaAuGarage' | 'creneau'>, maintenant: Date = new Date()): string | null {
  return v.dejaAuGarage ? arriveeMaintenant(maintenant) : v.creneau;
}

/**
 * Le retour prévu est postérieur à l'arrivée de la voiture, et à maintenant
 * pour une voiture déjà là.
 */
function borneRetour(v: Pick<ValeursIntervention, 'dejaAuGarage' | 'creneau'>, maintenant: Date): Date | null {
  const debut = debutDe(v, maintenant);
  if (!debut) return null;
  const d = new Date(debut);
  return v.dejaAuGarage && maintenant > d ? maintenant : d;
}

/** Retour prévu encore valable (null sinon) : à envoyer tel quel au dépôt. */
export function retourValable(v: Pick<ValeursIntervention, 'dejaAuGarage' | 'creneau' | 'retour'>, maintenant: Date = new Date()): string | null {
  const borne = borneRetour(v, maintenant);
  return v.retour && borne && new Date(v.retour) > borne ? v.retour : null;
}

/** « 112 300 » (espace fine insécable), pour préremplir le relevé. */
const milliers = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

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
  /** Position verticale de chaque bloc, pour y amener l'erreur après « Ajouter » */
  onPosition?: (bloc: BlocIntervention, y: number) => void;
  /**
   * Dernier kilométrage connu du véhicule (D7) : il préremplit le relevé du
   * dépôt, jamais obligatoire ; `kmLe` est la date de ce relevé, rappelée en
   * légende pour qu’on lise le compteur.
   */
  kmConnu?: number;
  kmLe?: string;
  /** Le kilométrage vient du formulaire d’un nouveau véhicule (étape 2) : il est le relevé du dépôt */
  kmNouveauVehicule?: boolean;
};

export function EtapeIntervention({ valeurs, onChange, erreurs, garage, membres, voirPrix, plusTard = true, onPosition, kmConnu, kmLe, kmNouveauVehicule }: Props) {
  const t = useTheme();
  const maj = (patch: Partial<ValeursIntervention>) => onChange((v) => ({ ...v, ...patch }));
  const champPrestation = useRef<TextInput>(null);
  const horaires = garage.horaires;
  const maintenant = new Date();

  // ── Rendez-vous : J à J+6 ouverts, « Autre date… » au-delà (P5)
  const jours = useMemo(() => joursProchains(horaires).filter((j) => !j.ferme).map((j) => j.date), [horaires]);
  const jourChoisi = jourDeCle(valeurs.jour);
  const creneaux = useMemo(() => creneauxDuJour(jourChoisi, horaires), [valeurs.jour, horaires]);
  const creneauxAVenir = creneaux.filter((c) => !c.passe);
  const sansHoraires = !horairesRenseignes(horaires);
  const prestationLibre = valeurs.prestation.trim() !== '' && !(PRESTATIONS as readonly string[]).includes(valeurs.prestation.trim());
  // « Autre » reste sélectionnée après l'appui, le temps de saisir la prestation.
  const [autre, setAutre] = useState(prestationLibre);
  const [feuille, setFeuille] = useState<'rdv' | 'retour' | null>(null);

  function choisirJour(d: Date) {
    // Changer de jour propose son premier créneau libre.
    onChange((v) => (v.jour === cleJour(d) ? v : { ...v, jour: cleJour(d), creneau: premierCreneauLibre(d, horaires)?.iso ?? null }));
  }

  // ── Retour prévu : après l'arrivée (maintenant si la voiture est là, sinon le créneau)
  const borne = borneRetour(valeurs, maintenant);
  const jourArrivee = valeurs.dejaAuGarage ? startOfDay(maintenant) : jourChoisi;
  const apres = borne ?? maintenant;
  const soir = fermetureDu(horaires, jourArrivee);
  const soirPossible = soir !== null && new Date(soir) > apres;
  const heuresDuJour = heuresRetour(horaires, jourArrivee, apres)
    .map((hm) => ({ hm, iso: aHeureIso(jourArrivee, hm) }))
    .filter((h) => h.iso !== soir);
  const lendemain = jourOuvertSuivant(horaires, jourArrivee);
  const jourRetour = valeurs.retour ? startOfDay(new Date(valeurs.retour)) : null;
  const retourAutreJour = jourRetour !== null && !isSameDay(jourRetour, jourArrivee);
  const retourLendemain = retourAutreJour && lendemain !== null && isSameDay(jourRetour!, lendemain);
  const retourAilleurs = retourAutreJour && !retourLendemain;
  const soirLabel = soir
    ? isToday(jourArrivee)
      ? `${new Date(soir).getHours() >= 17 ? 'Ce soir' : 'Aujourd’hui'} ${heure(soir)}`
      : `${libelleJourPuce(jourArrivee)} ${heure(soir)}`
    : '';
  const lendemainLabel = lendemain ? libelleJourPuce(lendemain) : '';

  // Un retour devenu antérieur à l'arrivée (autre jour, autre créneau, heure passée) revient à « À définir ».
  const retourGarde = retourValable(valeurs, maintenant);
  useEffect(() => {
    if (valeurs.retour && !retourGarde) onChange((v) => ({ ...v, retour: null }));
  }, [valeurs.retour, retourGarde, onChange]);

  /** Retour un autre jour que l'arrivée : la fermeture de ce jour, à affiner par les heures. */
  function retourLe(d: Date) {
    const iso = fermetureDu(horaires, d) ?? aHeureIso(d, '18:00');
    if (new Date(iso) > apres) maj({ retour: iso });
  }

  const quandRetourLu = (iso: string) => format(new Date(iso), "EEEE d MMMM 'à' HH:mm", { locale: fr });

  // Relevé prérempli (D7) : le dernier connu, repris tant qu’on n’y touche pas, même si le véhicule change
  // (retour à l’étape 2 : l’étape 3 est remontée, `kmRepris` garde ce qui avait été repris).
  const kmPrerempli = kmConnu != null ? milliers(kmConnu) : '';
  useEffect(() => {
    onChange((v) =>
      v.dejaAuGarage && v.kmRepris !== kmPrerempli && v.km === v.kmRepris ? { ...v, km: kmPrerempli, kmRepris: kmPrerempli } : v,
    );
  }, [kmPrerempli, onChange]);

  function basculerDejaAuGarage() {
    // La voiture est là : le relevé du dépôt part du dernier relevé (D7), la légende dit sa date.
    onChange((v) =>
      !v.dejaAuGarage && !v.km.trim()
        ? { ...v, dejaAuGarage: true, km: kmPrerempli, kmRepris: kmPrerempli }
        : { ...v, dejaAuGarage: !v.dejaAuGarage },
    );
  }
  const kmRepris = kmPrerempli !== '' && valeurs.km === kmPrerempli && valeurs.km === valeurs.kmRepris;

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      {/* Prestation */}
      <View onLayout={(e) => onPosition?.('prestation', e.nativeEvent.layout.y)}>
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
      </View>

      {/* Mécanicien, juste sous la prestation : atteint sans défiler */}
      <Etiquette accessibilityRole="header" className="mb-2 ml-1">
        Mécanicien
      </Etiquette>
      <View className="mb-6">
        <Puces>
          {plusTard ? (
            <Puce label="Plus tard" active={valeurs.membreId === null} onPress={() => maj({ membreId: null })} accessibilityLabel="Mécanicien plus tard, à attribuer" />
          ) : null}
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

      {/* Quand ? « Déjà au garage » en tête, quel que soit le jour */}
      <View onLayout={(e) => onPosition?.('creneau', e.nativeEvent.layout.y)}>
        <Etiquette accessibilityRole="header" className="mb-2 ml-1">
          Quand ?
        </Etiquette>
        <View className="mb-3">
          <Puces>
            <Puce
              label="Déjà au garage"
              active={valeurs.dejaAuGarage}
              onPress={basculerDejaAuGarage}
              icone={<Icone nom="voiture" taille={16} couleur={valeurs.dejaAuGarage ? t.blanc : t.muted} />}
              accessibilityLabel="Déjà au garage : la voiture est là, réceptionner à l’ajout"
            />
          </Puces>
        </View>
        {valeurs.dejaAuGarage ? (
          <Legende className="mb-6 ml-1">
            Arrivée notée à {heure(arriveeMaintenant(maintenant))} : la voiture passe directement en « Véhicule reçu ».
          </Legende>
        ) : (
          <View className="mb-6">
            <PucesJours jours={jours} valeur={jourChoisi} onChoisir={choisirJour} autreDate={() => setFeuille('rdv')} />
            <View className="mt-3">
              {!creneaux.length ? (
                <Legende className="ml-1">Le garage est fermé ce jour.</Legende>
              ) : creneauxAVenir.length === 0 ? (
                <Legende className="ml-1">Plus de créneau ce jour, choisissez un autre jour.</Legende>
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
          </View>
        )}
      </View>

      {/* Kilométrage relevé au dépôt (D7) : la voiture est là, jamais obligatoire */}
      {valeurs.dejaAuGarage ? (
        <View onLayout={(e) => onPosition?.('km', e.nativeEvent.layout.y)}>
          <Champ
            libelle="Kilométrage (facultatif)"
            type="nombre"
            value={valeurs.km}
            onChangeText={(km) => maj({ km })}
            onBlur={() => {
              const n = Number(valeurs.km.replace(/\D/g, ''));
              if (valeurs.km.trim() && Number.isSafeInteger(n)) maj({ km: milliers(n) });
            }}
            erreur={erreurs.km}
            placeholder={kmConnu != null ? `Dernier relevé : ${kilometrage(kmConnu)}` : 'Relevé au compteur'}
            aide={
              kmRepris
                ? kmNouveauVehicule
                  ? 'Kilométrage saisi pour le véhicule.'
                  : aideReleveRepris(kmLe)
                : kmConnu != null
                  ? `Dernier relevé : ${kilometrage(kmConnu)}${kmLe ? `, le ${format(new Date(kmLe), 'd MMMM yyyy', { locale: fr })}` : ''}.`
                  : 'Relevé au compteur, à l’arrivée.'
            }
            className="mb-6"
          />
        </View>
      ) : null}

      {/* Retour prévu : ce que le client lira sur sa page de suivi */}
      <Etiquette accessibilityRole="header" className="mb-2 ml-1">
        Retour prévu
      </Etiquette>
      <View className="mb-6">
        <Puces>
          <Puce label="À définir" active={valeurs.retour === null} onPress={() => maj({ retour: null })} accessibilityLabel="Retour prévu à définir" />
          {soirPossible ? (
            <Puce
              label={soirLabel}
              active={valeurs.retour === soir}
              onPress={() => maj({ retour: soir })}
              accessibilityLabel={`Retour prévu ${quandRetourLu(soir!)}`}
            />
          ) : null}
          {/* Les heures du jour d’arrivée ; un retour un autre jour a sa propre rangée d’heures, dessous. */}
          {(retourAutreJour ? [] : heuresDuJour).map((h) => (
            <Puce
              key={h.iso}
              label={h.hm}
              active={valeurs.retour === h.iso}
              onPress={() => maj({ retour: h.iso })}
              accessibilityLabel={`Retour prévu ${quandRetourLu(h.iso)}`}
            />
          ))}
          {lendemain ? (
            <Puce
              label={lendemainLabel}
              active={retourLendemain}
              onPress={() => retourLe(lendemain)}
              accessibilityLabel={`Retour prévu ${format(lendemain, 'EEEE d MMMM', { locale: fr })}`}
            />
          ) : null}
          <Puce
            label={retourAilleurs && jourRetour ? format(jourRetour, 'EEE d MMM', { locale: fr }) : 'Autre…'}
            active={retourAilleurs}
            onPress={() => setFeuille('retour')}
            accessibilityLabel={retourAilleurs && valeurs.retour ? `Retour prévu ${quandRetourLu(valeurs.retour)}, changer de jour` : 'Retour prévu : choisir une autre date'}
          />
        </Puces>
        {retourAutreJour && jourRetour ? (
          <View className="mt-3">
            <Legende className="mb-2 ml-1">Heure du retour, {format(jourRetour, 'EEEE d MMMM', { locale: fr })} :</Legende>
            <PucesHeures
              heures={heuresRetour(horaires, jourRetour, apres)}
              valeur={heure(valeurs.retour!)}
              onChoisir={(hm) => {
                if (hm) maj({ retour: aHeureIso(jourRetour, hm) });
              }}
            />
          </View>
        ) : null}
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

      <Champ
        libelle="Demande du client (facultatif)"
        type="multiligne"
        value={valeurs.demande}
        onChangeText={(demande) => maj({ demande })}
        placeholder="Bruit au freinage depuis une semaine…"
        className="mb-6"
      />

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
        <View onLayout={(e) => onPosition?.('montant', e.nativeEvent.layout.y)}>
          <Champ
            libelle="Montant estimé (facultatif)"
            type="nombre"
            value={valeurs.montant}
            onChangeText={(montant) => maj({ montant })}
            erreur={erreurs.montant}
            placeholder="149"
            aide="En euros, ordre de grandeur pour le client."
          />
        </View>
      ) : null}

      <FeuilleDate
        ouverte={feuille === 'rdv'}
        onFermer={() => setFeuille(null)}
        titre="Jour du rendez-vous"
        horaires={horaires}
        valeur={jourChoisi}
        onChoisir={(d) => {
          choisirJour(d);
          setFeuille(null);
        }}
      />
      <FeuilleDate
        ouverte={feuille === 'retour'}
        onFermer={() => setFeuille(null)}
        titre="Retour prévu"
        horaires={horaires}
        valeur={jourRetour}
        min={jourArrivee}
        onChoisir={(d) => {
          retourLe(d);
          setFeuille(null);
        }}
      />
    </Animated.View>
  );
}
