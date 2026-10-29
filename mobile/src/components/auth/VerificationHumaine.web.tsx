/**
 * Widget Cloudflare Turnstile de « Créer un compte », variante web : le
 * script de Cloudflare est injecté une fois dans la page, puis le widget est
 * rendu dans un conteneur du formulaire (rendu explicite). Même interface
 * que la variante iOS et Android (`VerificationHumaine.tsx`). Le domaine vu
 * par Cloudflare est celui de la page : il doit figurer sur le widget (et
 * dans TURNSTILE_HOSTNAMES) pour qu'une inscription web passe. Thème
 * « auto » : comme les couleurs de la page (requête média), le widget suit
 * le navigateur, même quand il change de thème en cours de route.
 */

import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';

import { type EvenementTurnstile, optionsWidget, type PropsVerification, URL_SCRIPT_TURNSTILE, useEvenementsTurnstile } from './verification';

type Turnstile = {
  render(conteneur: HTMLElement, options: Record<string, unknown>): string | undefined;
  reset(id: string): void;
  remove(id: string): void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
    rencarTurnstileCharge?: () => void;
  }
}

let chargement: Promise<Turnstile> | null = null;

/** Script de Cloudflare chargé une seule fois ; un échec permet un nouvel essai. */
function chargerTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  chargement ??= new Promise<Turnstile>((ok, ko) => {
    window.rencarTurnstileCharge = () => (window.turnstile ? ok(window.turnstile) : ko(new Error('turnstile absent')));
    const script = document.createElement('script');
    script.src = `${URL_SCRIPT_TURNSTILE}&onload=rencarTurnstileCharge`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      script.remove();
      chargement = null;
      ko(new Error('script injoignable'));
    };
    document.head.appendChild(script);
  });
  return chargement;
}

export function VerificationHumaine({ ref, ...props }: PropsVerification) {
  const conteneur = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const { visible, traiter, montrer } = useEvenementsTurnstile(props);

  useEffect(() => {
    let actif = true;
    const signaler = (e: EvenementTurnstile) => {
      if (actif) traiter(e);
    };
    chargerTurnstile()
      .then((turnstile) => {
        if (!actif || !conteneur.current) return;
        widget.current =
          turnstile.render(conteneur.current, {
            ...optionsWidget('auto'),
            callback: (jeton: string) => signaler({ type: 'jeton', jeton: String(jeton) }),
            'error-callback': (code: unknown) => {
              signaler({ type: 'erreur', code: String(code ?? '') });
              return true;
            },
            'expired-callback': () => signaler({ type: 'expire' }),
            'timeout-callback': () => signaler({ type: 'delai' }),
            'before-interactive-callback': () => signaler({ type: 'interaction', visible: true }),
            'after-interactive-callback': () => signaler({ type: 'interaction', visible: false }),
            'unsupported-callback': () => signaler({ type: 'non_pris_en_charge' }),
          }) ?? null;
      })
      .catch(() => signaler({ type: 'chargement' }));
    return () => {
      actif = false;
      const id = widget.current;
      widget.current = null;
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          // widget déjà retiré
        }
      }
    };
  }, [generation, traiter]);

  useImperativeHandle(ref, () => ({
    relancer() {
      props.onJeton(null);
      const id = widget.current;
      if (id && window.turnstile) {
        try {
          window.turnstile.reset(id);
          return;
        } catch {
          // widget perdu : on le recrée
        }
      }
      montrer(false);
      setGeneration((g) => g + 1);
    },
  }));

  return (
    <View
      style={{ height: visible ? undefined : 0, overflow: 'hidden' }}
      className={visible ? 'mb-3' : ''}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>
      <div ref={conteneur} aria-label="Vérification anti-robot de Cloudflare" />
    </View>
  );
}
