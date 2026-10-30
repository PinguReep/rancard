/**
 * Écran d’accord de la rédaction des SMS par l’IA (règle App Store
 * 5.1.2(i) : dire clairement quelles données partent vers une IA tierce,
 * laquelle, et obtenir une permission explicite avant). Montré au gérant
 * qui active l’option dans Profil › Garage ; rien n’est coché d’avance,
 * « Ne pas autoriser » laisse l’app entière (le texte habituel du SMS
 * reste). L’accord est enregistré avec la version de ce texte
 * (`VERSION_ACCORD_IA`) : changer ce texte, c’est changer la version.
 *
 * Le contenu doit rester conforme à ce que fait la fonction Edge
 * `redaction` (supabase/functions/redaction) et à la politique de
 * confidentialité (site/confidentialite.html, section « Rédaction des SMS
 * par l’IA »).
 */

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Bouton, Erreur, Feuille, Legende, Secondaire, Texte, impulsion } from '@/components/ui';
import { ouvrirPage, URL_CONFIDENTIALITE } from '@/lib/liens';

const BLOCS: { titre: string; texte: string }[] = [
  {
    titre: 'Ce que fait l’IA',
    texte:
      'Quand un membre de l’équipe touche « Rédiger avec l’IA », Mistral AI propose le texte du SMS au client. Ce texte n’est jamais envoyé seul : la personne le relit, le corrige et l’envoie elle-même. L’IA peut se tromper : relisez toujours.',
  },
  {
    titre: 'Ce qui part chez Mistral AI',
    texte:
      'L’objet du message (véhicule prêt, attente pièce, devis, rappel), l’état de l’intervention, l’intitulé des travaux et la note écrite par l’équipe, après retrait des noms, numéros, e-mails, plaques et adresses.',
  },
  {
    titre: 'Ce qui ne part jamais',
    texte:
      'Le nom et le prénom du client, son téléphone, son e-mail, la plaque, le montant, le nom du garage et ceux de l’équipe. Rencar les ajoute au texte une fois qu’il revient.',
  },
  {
    titre: 'Où et comment',
    texte:
      'Mistral AI est une société française. Les demandes sont traitées sur ses serveurs situés en Europe (Union européenne et AELE), pour le compte de Rencar, sans servir à entraîner ses modèles ; Mistral AI peut les garder un temps limité pour la sécurité de son service. Rencar ne garde pas la note envoyée à l’IA.',
  },
];

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  /** Lève en cas de refus : la feuille reste ouverte et l’affiche */
  onAutoriser: () => Promise<void>;
};

export function FeuilleAccordIa({ ouverte, onFermer, onAutoriser }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);

  async function autoriser() {
    setErreur(null);
    try {
      await onAutoriser();
    } catch (e) {
      setErreur((e as Error).message || 'L’accord n’a pas pu être enregistré. Réessayez.');
    }
  }

  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre="Rédaction des SMS par l’IA" legende="Mistral AI, serveurs en Europe">
      {/* Le texte défile, les deux choix restent toujours visibles dessous. */}
      <ScrollView bounces={false} showsVerticalScrollIndicator style={{ flexShrink: 1 }}>
        {BLOCS.map((b) => (
          <View key={b.titre} className="mb-3">
            <Texte className="font-semibold">{b.titre}</Texte>
            <Secondaire className="mt-0.5">{b.texte}</Secondaire>
          </View>
        ))}
        <Secondaire className="mb-1">
          {'En autorisant, vous donnez cet accord au nom du garage. Il est enregistré avec votre nom et la date, et se retire à tout moment ici même.'}
        </Secondaire>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Lire la politique de confidentialité"
          onPress={() => {
            impulsion();
            void ouvrirPage(URL_CONFIDENTIALITE);
          }}
          className="mb-1 min-h-[44px] justify-center self-start active:opacity-60">
          <Texte ton="accent" className="font-semibold">
            Politique de confidentialité
          </Texte>
        </Pressable>
      </ScrollView>
      <View className="border-t border-line pt-3 dark:border-line-dark">
        {erreur ? <Erreur className="mb-2 ml-1">{erreur}</Erreur> : null}
        <View className="gap-2">
          <Bouton onPress={autoriser} accessibilityLabel="Autoriser la rédaction des SMS par Mistral AI">
            Autoriser
          </Bouton>
          <Bouton variante="secondaire" onPress={onFermer} accessibilityLabel="Ne pas autoriser la rédaction des SMS par l’IA">
            Ne pas autoriser
          </Bouton>
        </View>
        <Legende className="ml-1 mt-2">Sans cet accord, l’équipe écrit les SMS comme aujourd’hui.</Legende>
      </View>
    </Feuille>
  );
}
