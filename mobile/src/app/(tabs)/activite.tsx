/**
 * Activité : les chiffres de la période, tous calculés depuis l'instantané.
 * Tuiles, origine des rendez-vous, par mécanicien, rendez-vous par jour et,
 * avec le réceptionniste, appels par jour. Aucune bibliothèque de graphiques.
 */

import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BarresHorizontales } from '@/components/activite/BarresHorizontales';
import { BarresVerticales } from '@/components/activite/BarresVerticales';
import { Bascule } from '@/components/activite/Bascule';
import { ParMecanicien } from '@/components/activite/ParMecanicien';
import { bornes, calculerStats, joursDecimal, libellePeriode, PERIODES, type Periode } from '@/components/activite/stats';
import { GrilleTuiles, type TuileDef } from '@/components/activite/Tuile';
import { Entete } from '@/components/entete';
import { Carte, Ecran, Section, Vide } from '@/components/ui';
import type { Origine } from '@/domain/types';
import { euros } from '@/lib/format';
import { useDonnees, useMembre, usePermissions } from '@/state/session';
import { useTheme, type Palette } from '@/theme/tokens';

const COULEUR_ORIGINE: Record<Origine, keyof Palette> = { site: 'accent', ia: 'ok', comptoir: 'muted', telephone: 'danger' };

export default function Activite() {
  const t = useTheme();
  const membre = useMembre();
  const p = usePermissions();
  const garage = useDonnees((s) => s.garage);
  const interventions = useDonnees((s) => s.interventions);
  const evenements = useDonnees((s) => s.evenements);
  const appels = useDonnees((s) => s.appels);
  const membres = useDonnees((s) => s.membres);
  const [periode, setPeriode] = useState<Periode>('semaine');

  const stats = useMemo(() => {
    const visibles = p.voirTout ? interventions : interventions.filter((i) => i.membreId === membre.id);
    const equipe = (p.voirTout ? membres : membres.filter((m) => m.id === membre.id)).filter((m) => m.actif);
    return calculerStats({
      interventions: visibles,
      evenements,
      appels,
      membres: equipe,
      receptionniste: garage.options.receptionniste,
      periode,
    });
  }, [interventions, evenements, appels, membres, membre.id, p.voirTout, garage.options.receptionniste, periode]);

  if (!p.activite) {
    return (
      <Ecran>
        <Entete titre="Activité" />
        <Vide icone="cadenas" titre="Accès réservé" texte="Les chiffres du garage sont visibles avec la permission « Voir l’activité ». Demandez-la au gérant." />
      </Ecran>
    );
  }

  const receptionniste = garage.options.receptionniste;
  const tuiles: TuileDef[] = [
    { id: 'rdv', libelle: 'Rendez-vous', valeur: String(stats.rendezVous), detail: 'créés sur la période' },
    { id: 'livres', libelle: 'Véhicules livrés', valeur: String(stats.livres) },
    {
      id: 'delai',
      libelle: 'Délai moyen d’immobilisation',
      valeur: stats.delaiMoyenJours == null ? '0 j' : joursDecimal(stats.delaiMoyenJours),
      detail: stats.delaiMoyenJours == null ? 'aucune livraison sur la période' : 'de la prise en charge à la livraison',
    },
    { id: 'bloquees', libelle: 'Bloquées en ce moment', valeur: String(stats.bloquees), ton: stats.bloquees ? 'warn' : undefined },
  ];
  if (p.voirPrix) tuiles.push({ id: 'montant', libelle: 'Montant estimé livré', valeur: euros(stats.montantLivre) || '0 €' });
  if (stats.appels) {
    tuiles.push(
      { id: 'appels', libelle: 'Appels traités', valeur: String(stats.appels.traites) },
      { id: 'hors', libelle: 'Dont hors horaires', valeur: String(stats.appels.horsHoraires), ton: stats.appels.horsHoraires ? 'warn' : undefined },
      { id: 'rdv-ia', libelle: 'Rendez-vous pris par le réceptionniste', valeur: String(stats.appels.rdvPris), ton: 'ok' },
    );
  }

  return (
    <Ecran defilant>
      <Entete titre="Activité" sousTitre={libellePeriode(periode, bornes(periode))} />
      <Bascule options={PERIODES} valeur={periode} onChange={setPeriode} />

      <Animated.View entering={FadeIn.duration(240)} className="px-4">
        <View className="mb-6">
          <GrilleTuiles tuiles={tuiles} />
        </View>

        <Section titre="Origine des rendez-vous">
          <Carte className="p-4">
            <BarresHorizontales
              unite="rendez-vous"
              barres={stats.origines.map((o) => ({ id: o.origine, label: o.label, valeur: o.valeur, couleur: t[COULEUR_ORIGINE[o.origine]] }))}
            />
          </Carte>
        </Section>

        <Section titre="Par mécanicien">
          <Carte className="p-4">
            <ParMecanicien lignes={stats.mecaniciens} />
          </Carte>
        </Section>

        <Section titre="Rendez-vous par jour">
          <Carte className="p-4">
            <BarresVerticales barres={stats.rdvParJour} couleur={t.accent} unite="rendez-vous" />
          </Carte>
        </Section>

        {receptionniste && stats.appelsParJour ? (
          <Section titre="Appels par jour">
            <Carte className="p-4">
              <BarresVerticales
                barres={stats.appelsParJour.map((j) => ({ jour: j.jour, valeur: j.valeur, segment: j.horsHoraires }))}
                couleur={t.accent}
                unite="appels"
                segment={{ couleur: t.warn, label: 'hors horaires' }}
              />
            </Carte>
          </Section>
        ) : null}
      </Animated.View>
    </Ecran>
  );
}
