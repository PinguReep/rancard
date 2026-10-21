/**
 * Appel dont le réceptionniste a créé une fiche à valider : résumé, fiche
 * proposée (véhicule, prestation, créneau) et le geste suivant évident,
 * « Valider et planifier ». Comme le « Confirmer » du planning, il reste en
 * bouton secondaire à icône d’accent : une seule action principale par
 * écran (« Prendre l’appel » quand un appel est en cours). Ignorer demande
 * une confirmation.
 */

import { useState } from 'react';
import { View } from 'react-native';

import { Bouton } from '@/components/ui/bouton';
import { Carte } from '@/components/ui/carte';
import { FeuilleConfirmation } from '@/components/ui/feuille-confirmation';
import { Icone, type NomIcone } from '@/components/ui/icone';
import { PastilleStatut } from '@/components/ui/pastille';
import { Etiquette, Legende, Mono, Secondaire, Texte } from '@/components/ui/texte';
import type { Appel, Intervention, Vehicule } from '@/domain/types';
import { duree, dureeSecondes, formaterTelephone, quand } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

type Props = {
  appel: Appel;
  intervention: Intervention;
  vehicule?: Vehicule;
  chargement?: boolean;
  onValider: () => void | Promise<void>;
  onModifier: () => void;
  onIgnorer: () => void | Promise<void>;
};

function LigneFiche({ icone, texte, detail, mono }: { icone: NomIcone; texte: string; detail?: string; mono?: boolean }) {
  const t = useTheme();
  return (
    <View className="flex-row items-center gap-2.5">
      <Icone nom={icone} taille={16} couleur={t.muted} />
      <Texte className="flex-1 text-[15px]" numberOfLines={1}>
        {texte}
      </Texte>
      {detail ? mono ? <Mono ton="muted">{detail}</Mono> : <Legende>{detail}</Legende> : null}
    </View>
  );
}

export function CarteAppelAValider({ appel, intervention, vehicule, chargement, onValider, onModifier, onIgnorer }: Props) {
  const t = useTheme();
  const [confirmer, setConfirmer] = useState(false);
  const nom = appel.appelant ?? formaterTelephone(appel.numero);

  return (
    <Carte className="p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Texte className="font-semibold" numberOfLines={1}>
            {nom}
          </Texte>
          <Legende className="mt-0.5">
            {quand(appel.debut)} · {dureeSecondes(appel.dureeSec)}
            {appel.horsHoraires ? ' · hors horaires' : ''}
          </Legende>
        </View>
        <PastilleStatut statut={intervention.statut} court />
      </View>

      <Secondaire className="mt-2">{appel.resume}</Secondaire>

      <View className="mt-4 gap-2 rounded-xl bg-surface2 p-3 dark:bg-surface2-dark">
        <Etiquette className="mb-0.5">Fiche proposée</Etiquette>
        <LigneFiche
          icone="voiture"
          texte={vehicule ? `${vehicule.marque} ${vehicule.modele}` : 'Véhicule à préciser'}
          detail={vehicule?.plaque}
          mono
        />
        <LigneFiche icone="cle" texte={intervention.prestation} />
        <LigneFiche icone="horloge" texte={quand(intervention.debut)} detail={duree(intervention.dureeMin)} />
      </View>

      <View className="mt-4 gap-2">
        <Bouton variante="secondaire" icone={<Icone nom="valider" taille={16} couleur={t.accent} />} onPress={onValider} chargement={chargement}>
          Valider et planifier
        </Bouton>
        <View className="flex-row gap-2">
          <Bouton className="flex-1" variante="secondaire" onPress={onModifier} desactive={chargement}>
            Modifier
          </Bouton>
          <Bouton className="flex-1" variante="discret" onPress={() => setConfirmer(true)} desactive={chargement}>
            Ignorer
          </Bouton>
        </View>
      </View>

      <FeuilleConfirmation
        ouverte={confirmer}
        onFermer={() => setConfirmer(false)}
        titre="Ignorer cet appel ?"
        texte="La fiche proposée sera annulée. L’appel reste dans l’historique et vous pourrez rappeler le client."
        libelle="Ignorer l’appel"
        variante="danger"
        onConfirmer={async () => {
          setConfirmer(false);
          await onIgnorer();
        }}
      />
    </Carte>
  );
}
