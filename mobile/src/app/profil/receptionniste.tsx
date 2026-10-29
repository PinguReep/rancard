/**
 * Réceptionniste (profil) : renvoyer la ligne du garage vers son numéro
 * Rencar, que l’agent décroche. Le garage garde son numéro ; c’est son
 * opérateur qui renvoie les appels (codes et sources dans
 * `domain/renvoi.ts`).
 *
 * Ouvert au gérant et aux membres qui ont la permission « appels », quand
 * la prestation réceptionniste est souscrite (`garage.options.receptionniste`).
 * Le numéro vient de `repo().renvoiReceptionniste()` (0017 côté serveur,
 * numéro fictif en démonstration) ; les choix de l’écran (mode, ligne,
 * opérateur) restent sur le téléphone, pour retrouver les bons codes
 * d’annulation plus tard.
 *
 * Geste principal : composer le code. L’iPhone refuse les liens `tel:` qui
 * contiennent « * » ou « # » : le code se copie et se colle dans le clavier
 * de l’app Téléphone (Android ouvre le clavier déjà rempli).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avis, useAvis } from '@/components/intervention/Avis';
import { LigneChoix } from '@/components/profil/LigneChoix';
import { useMembreCourant } from '@/components/profil/useMembreCourant';
import { Bouton, Carte, Ecran, Etiquette, Groupe, Icone, Legende, Pastille, Secondaire, Section, Texte, Vide, impulsion } from '@/components/ui';
import { Segments } from '@/components/ui/segments';
import { repo, type RenvoiReceptionniste } from '@/data';
import { peut } from '@/domain/permissions';
import {
  etatRenvoi,
  marcheASuivre,
  MODES,
  numeroAffiche,
  OPERATEURS,
  phraseEssai,
  type Etape,
  type ModeRenvoi,
  type Operateur,
  type TypeLigne,
} from '@/domain/renvoi';
import { ilYA } from '@/lib/format';
import { useDonnees } from '@/state/session';
import { useTheme } from '@/theme/tokens';

type Choix = { mode: ModeRenvoi; ligne: TypeLigne; operateur: Operateur | null };
const CHOIX_DEFAUT: Choix = { mode: 'conditionnel', ligne: 'fixe', operateur: null };

type Chargement =
  | { etat: 'chargement' }
  | { etat: 'pret'; renvoi: RenvoiReceptionniste | null }
  | { etat: 'erreur'; message: string };

/** Choix de l’écran, gardés sur le téléphone (par garage). Stockage illisible : choix par défaut. */
function useChoix(garageId: string): [Choix, (patch: Partial<Choix>) => void] {
  const cle = `rencar.renvoi.v1.${garageId}`;
  const [choix, setChoix] = useState<Choix>(CHOIX_DEFAUT);

  useEffect(() => {
    let actif = true;
    AsyncStorage.getItem(cle)
      .then((brut) => {
        if (!actif || !brut) return;
        const lu = JSON.parse(brut) as Partial<Choix>;
        setChoix({
          mode: lu.mode === 'tous' ? 'tous' : 'conditionnel',
          ligne: lu.ligne === 'mobile' ? 'mobile' : 'fixe',
          operateur: OPERATEURS.some((o) => o.id === lu.operateur) ? (lu.operateur as Operateur) : null,
        });
      })
      .catch(() => {
        // choix par défaut
      });
    return () => {
      actif = false;
    };
  }, [cle]);

  function changer(patch: Partial<Choix>) {
    setChoix((avant) => {
      const apres = { ...avant, ...patch };
      AsyncStorage.setItem(cle, JSON.stringify(apres)).catch(() => {
        // non bloquant : le choix sera à refaire au prochain passage
      });
      return apres;
    });
  }

  return [choix, changer];
}

/** Numéro Rencar du garage, relu quand un nouvel appel arrive (l’état « vérifié » suit). */
function useRenvoi(): [Chargement, () => void] {
  const [chargement, setChargement] = useState<Chargement>({ etat: 'chargement' });
  const [essai, setEssai] = useState(0);
  const dernierAppelConnu = useDonnees((s) => s.appels.reduce((d, a) => (a.debut > d ? a.debut : d), ''));

  useEffect(() => {
    let actif = true;
    repo()
      .renvoiReceptionniste()
      .then(
        (renvoi) => {
          if (actif) setChargement({ etat: 'pret', renvoi });
        },
        (e: unknown) => {
          if (actif) setChargement({ etat: 'erreur', message: (e as Error)?.message || 'Numéro indisponible pour le moment.' });
        },
      );
    return () => {
      actif = false;
    };
  }, [essai, dernierAppelConnu]);

  return [
    chargement,
    () => {
      setChargement({ etat: 'chargement' });
      setEssai((n) => n + 1);
    },
  ];
}

/** Puces de choix sur une ligne (opérateur) : cible de 44 pt, un seul choix. */
function Puces<T extends string>({ options, valeur, onChange }: { options: { id: T; label: string }[]; valeur: T | null; onChange: (v: T) => void }) {
  return (
    <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
      {options.map((o) => {
        const actif = o.id === valeur;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: actif, checked: actif }}
            accessibilityLabel={o.label}
            onPress={() => {
              if (actif) return;
              impulsion('leger');
              onChange(o.id);
            }}
            className={`min-h-[44px] items-center justify-center rounded-full border px-4 ${
              actif
                ? 'border-accent bg-accent dark:border-accent-fond dark:bg-accent-fond'
                : 'border-line bg-surface active:opacity-70 dark:border-line-dark dark:bg-surface-dark'
            }`}>
            <Text maxFontSizeMultiplier={1.4} className={`text-[15px] font-semibold ${actif ? 'text-white' : 'text-ink dark:text-ink-dark'}`}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Code à composer, en grand, avec son geste (copier, ou composer sur Android). */
function CarteCode({
  etape,
  numero,
  surPortable,
  principal,
  onCopier,
}: {
  etape: Etape;
  numero?: number;
  surPortable: boolean;
  principal: boolean;
  onCopier: (code: string) => void;
}) {
  const code = etape.code;
  const composer = surPortable && Platform.OS === 'android';
  return (
    <Carte className="mb-3 p-4">
      <View className="flex-row gap-3">
        {numero ? (
          <View className="h-7 w-7 items-center justify-center rounded-full bg-surface2 dark:bg-surface2-dark">
            <Text maxFontSizeMultiplier={1.4} className="text-[14px] font-semibold text-ink dark:text-ink-dark">
              {numero}
            </Text>
          </View>
        ) : null}
        <View className="flex-1">
          <Secondaire ton="ink">{etape.texte}</Secondaire>
          {code ? (
            <Text
              selectable
              maxFontSizeMultiplier={1.6}
              accessibilityLabel={`Code ${code.split('').join(' ')}`}
              className="mt-2 font-mono text-[24px] font-semibold tracking-wide text-ink dark:text-ink-dark">
              {code}
            </Text>
          ) : null}
        </View>
      </View>
      {/* Ligne fixe : le code se tape sur le téléphone du garage, rien à copier. */}
      {code && surPortable ? (
        <View className={`mt-3 flex-row gap-2 ${principal ? '' : 'self-start'}`}>
          {composer ? (
            <Bouton
              compact
              className={principal ? 'flex-1' : ''}
              variante={principal ? 'principal' : 'secondaire'}
              accessibilityLabel={`Composer le code ${code}`}
              onPress={() => {
                Linking.openURL(`tel:${encodeURIComponent(code)}`).catch(() => onCopier(code));
              }}>
              Composer
            </Bouton>
          ) : null}
          <Bouton
            compact
            className={principal ? 'flex-1' : ''}
            variante={principal && !composer ? 'principal' : 'secondaire'}
            accessibilityLabel={`Copier le code ${code}`}
            onPress={() => onCopier(code)}>
            Copier le code
          </Bouton>
        </View>
      ) : null}
    </Carte>
  );
}

export default function Receptionniste() {
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const moi = useMembreCourant();
  const garage = useDonnees((s) => s.garage);
  const [chargement, recharger] = useRenvoi();
  const [choix, changer] = useChoix(garage.id);
  const [avis, montrerAvis] = useAvis();

  const renvoi = chargement.etat === 'pret' ? chargement.renvoi : null;
  const marche = useMemo(
    () =>
      renvoi && (choix.ligne === 'mobile' || choix.operateur)
        ? marcheASuivre(choix.ligne, choix.operateur ?? 'autre', choix.mode, renvoi.numero)
        : null,
    [renvoi, choix],
  );

  if (!garage.options.receptionniste) {
    return (
      <Ecran sansHaut>
        <Stack.Screen options={{ title: 'Réceptionniste' }} />
        <Vide icone="cadenas" titre="Réceptionniste" texte="Non inclus dans l’offre de votre garage." />
      </Ecran>
    );
  }
  if (!peut(moi, 'appels')) {
    return (
      <Ecran sansHaut>
        <Stack.Screen options={{ title: 'Réceptionniste' }} />
        <Vide icone="cadenas" titre="Réservé au gérant" texte="Le renvoi d’appel est réglé par le gérant ou un membre qui traite les appels." />
      </Ecran>
    );
  }

  async function copier(texte: string, quoi: 'code' | 'numero') {
    try {
      await Clipboard.setStringAsync(texte);
      impulsion('succes');
      montrerAvis(quoi === 'code' ? 'Code copié' : 'Numéro copié');
    } catch {
      impulsion('erreur');
      montrerAvis('Copie impossible\u00a0: recopiez le code à la main');
    }
  }

  const etat = renvoi ? etatRenvoi(renvoi.dernierAppelLe) : 'aucun';
  const surPortable = choix.ligne === 'mobile';
  const commentComposer = surPortable
    ? Platform.OS === 'android'
      ? 'Sur le portable du garage\u00a0: touchez «\u00a0Composer\u00a0», puis appelez. Un message de l’opérateur confirme le renvoi.'
      : 'Sur le portable du garage\u00a0: copiez le code, ouvrez l’app Téléphone, collez-le dans le clavier (appui long) et appelez. Un message de l’opérateur confirme le renvoi.'
    : 'Décrochez le téléphone du garage et composez le code. Attendez le message de confirmation, puis raccrochez.';

  return (
    <Ecran sansHaut>
      <Stack.Screen options={{ title: 'Réceptionniste' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} contentInsetAdjustmentBehavior="automatic">
        <Carte className="mb-6 p-4">
          <Etiquette className="mb-1">Votre numéro Rencar</Etiquette>
          {chargement.etat === 'chargement' ? (
            <View className="items-start py-3">
              <ActivityIndicator color={t.muted} accessibilityLabel="Chargement du numéro" />
            </View>
          ) : chargement.etat === 'erreur' ? (
            <View>
              <Secondaire className="mt-1">{chargement.message}</Secondaire>
              <Bouton compact variante="secondaire" className="mt-3 self-start" onPress={recharger} accessibilityLabel="Réessayer de lire le numéro">
                Réessayer
              </Bouton>
            </View>
          ) : !renvoi ? (
            <Secondaire className="mt-1">
              Pas encore attribué. L’équipe Rencar vous le communique à l’installation du réceptionniste.
            </Secondaire>
          ) : (
            <View>
              <Text
                selectable
                maxFontSizeMultiplier={1.6}
                accessibilityLabel={`Numéro Rencar ${numeroAffiche(renvoi.numero)}`}
                className="font-mono text-[30px] font-semibold tracking-tight text-ink dark:text-ink-dark">
                {numeroAffiche(renvoi.numero)}
              </Text>
              <Secondaire className="mt-1">{'L’agent décroche les appels renvoyés vers ce numéro. Vos clients, eux, gardent le vôtre\u00a0: inutile de leur donner celui-ci.'}</Secondaire>
              <View className="mt-3 flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Pastille
                    label={etat === 'verifie' ? 'Renvoi vérifié' : 'Renvoi à vérifier'}
                    ton={etat === 'verifie' ? 'ok' : 'muted'}
                    point={etat === 'verifie'}
                  />
                  <Legende className="mt-1.5">
                    {etat === 'aucun'
                      ? 'Aucun appel reçu sur ce numéro pour l’instant.'
                      : `Dernier appel pris par l’agent\u00a0: ${ilYA(renvoi.dernierAppelLe ?? '')}.`}
                  </Legende>
                </View>
                <Bouton
                  compact
                  variante="secondaire"
                  onPress={() => copier(renvoi.numero.startsWith('+33') ? numeroAffiche(renvoi.numero).replace(/ /g, '') : renvoi.numero, 'numero')}
                  accessibilityLabel="Copier le numéro Rencar">
                  Copier le numéro
                </Bouton>
              </View>
            </View>
          )}
        </Carte>

        {renvoi ? (
          <>
            <Groupe titre="Quand renvoyer">
              {(Object.keys(MODES) as ModeRenvoi[]).map((m, i, tous) => (
                <LigneChoix
                  key={m}
                  titre={MODES[m].titre}
                  description={MODES[m].description}
                  choisi={choix.mode === m}
                  onPress={() => changer({ mode: m })}
                  derniere={i === tous.length - 1}
                />
              ))}
            </Groupe>

            <Section titre="La ligne du garage">
              <Segments<TypeLigne>
                options={[
                  { id: 'fixe', label: 'Fixe ou box' },
                  { id: 'mobile', label: 'Portable' },
                ]}
                valeur={choix.ligne}
                onChange={(ligne) => changer({ ligne })}
                className=""
              />
              {choix.ligne === 'fixe' ? (
                <View className="mt-4">
                  <Legende className="mb-2 ml-1">Opérateur de la ligne</Legende>
                  <Puces options={OPERATEURS} valeur={choix.operateur} onChange={(operateur) => changer({ operateur })} />
                </View>
              ) : null}
            </Section>

            {marche ? (
              <>
                <Section titre="Programmer le renvoi">
                  <Secondaire className="mb-3 ml-1">{marche.activer.some((e) => e.code) ? commentComposer : 'Pas de code pour ce renvoi chez cet opérateur\u00a0: il se règle en ligne.'}</Secondaire>
                  {marche.activer.map((etape, i) => (
                    <CarteCode
                      key={`a${i}`}
                      etape={etape}
                      numero={marche.activer.length > 1 ? i + 1 : undefined}
                      surPortable={surPortable}
                      principal={i === 0}
                      onCopier={(code) => copier(code, 'code')}
                    />
                  ))}
                  {marche.autreChemin ? <Legende className="ml-1">{marche.autreChemin}</Legende> : null}
                  {marche.remarque ? <Legende className="ml-1 mt-1">{marche.remarque}</Legende> : null}
                </Section>

                <Section titre="Essayer">
                  <Carte className="flex-row gap-3 p-4">
                    <View className="h-9 w-9 items-center justify-center rounded-xl bg-surface2 dark:bg-surface2-dark">
                      <Icone nom="telephone" taille={18} couleur={t.ink} />
                    </View>
                    <View className="flex-1">
                      <Texte>{phraseEssai(choix.mode)}</Texte>
                      <Legende className="mt-1">{'L’appel apparaît dans l’onglet Appels et le renvoi passe à «\u00a0vérifié\u00a0» en haut de cet écran.'}</Legende>
                    </View>
                  </Carte>
                </Section>

                <Section titre="Annuler le renvoi">
                  {marche.desactiver.map((etape, i) => (
                    <CarteCode
                      key={`d${i}`}
                      etape={etape}
                      surPortable={surPortable}
                      principal={false}
                      onCopier={(code) => copier(code, 'code')}
                    />
                  ))}
                </Section>
              </>
            ) : (
              <Legende className="ml-1">Choisissez l’opérateur de la ligne pour voir la marche à suivre.</Legende>
            )}
          </>
        ) : null}
      </ScrollView>
      <Avis texte={avis} flottant />
    </Ecran>
  );
}
