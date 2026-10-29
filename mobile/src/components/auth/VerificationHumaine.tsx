/**
 * Widget Cloudflare Turnstile de « Créer un compte », iOS et Android : une
 * petite page dans une WebView, servie sous https://rencar.fr/ (`baseUrl`)
 * pour que le domaine vu par Cloudflare soit celui du widget. La page charge
 * le script de Cloudflare (rendu explicite) et renvoie chaque évènement par
 * `window.ReactNativeWebView.postMessage`. Hauteur nulle tant que
 * Cloudflare ne demande rien ; la case apparaît dans le formulaire quand
 * une interaction est nécessaire. Variante web : `VerificationHumaine.web.tsx`.
 */

import { useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest, WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';

import { ouvrirPage } from '@/lib/liens';
import { useTheme } from '@/theme/tokens';

import {
  type EvenementTurnstile,
  HAUTEUR_WIDGET,
  optionsWidget,
  ORIGINE_WIDGET,
  type PropsVerification,
  URL_SCRIPT_TURNSTILE,
  useEvenementsTurnstile,
} from './verification';

/** Page du widget. Les options sont du JSON, jamais du texte saisi : rien à échapper au-delà de « < ». */
function page(theme: 'light' | 'dark'): string {
  const options = JSON.stringify(optionsWidget(theme)).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}#w{display:flex;justify-content:center}</style>
<script>
(function () {
  var id = null;
  function signaler(m) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {}
  }
  window.rencarCharge = function () {
    try {
      var o = ${options};
      o.callback = function (jeton) { signaler({ type: 'jeton', jeton: String(jeton) }); };
      o['error-callback'] = function (code) { signaler({ type: 'erreur', code: String(code || '') }); return true; };
      o['expired-callback'] = function () { signaler({ type: 'expire' }); };
      o['timeout-callback'] = function () { signaler({ type: 'delai' }); };
      o['before-interactive-callback'] = function () { signaler({ type: 'interaction', visible: true }); };
      o['after-interactive-callback'] = function () { signaler({ type: 'interaction', visible: false }); };
      o['unsupported-callback'] = function () { signaler({ type: 'non_pris_en_charge' }); };
      id = window.turnstile.render('#w', o);
      signaler({ type: 'pret' });
    } catch (e) {
      signaler({ type: 'erreur', code: 'rendu' });
    }
  };
  window.rencarRelancer = function () {
    try { if (id !== null) window.turnstile.reset(id); } catch (e) { signaler({ type: 'erreur', code: 'relance' }); }
  };
  window.rencarEchecScript = function () { signaler({ type: 'chargement' }); };
})();
</script>
<script src="${URL_SCRIPT_TURNSTILE}&onload=rencarCharge" async defer onerror="rencarEchecScript()"></script>
</head>
<body><div id="w"></div></body>
</html>`;
}

function lire(e: WebViewMessageEvent): EvenementTurnstile | null {
  try {
    const m = JSON.parse(e.nativeEvent.data) as EvenementTurnstile;
    return m && typeof m.type === 'string' ? m : null;
  } catch {
    return null;
  }
}

/** La page reste sur son adresse : un lien du widget (aide, confidentialité de Cloudflare) s'ouvre dans le navigateur. */
function garderLaPage(r: ShouldStartLoadRequest): boolean {
  if (r.isTopFrame === false) return true;
  const url = r.url ?? '';
  if (url === ORIGINE_WIDGET || url === ORIGINE_WIDGET.replace(/\/$/, '') || url.startsWith('about:')) return true;
  if (/^https:\/\//.test(url)) void ouvrirPage(url);
  return false;
}

export function VerificationHumaine({ ref, ...props }: PropsVerification) {
  const t = useTheme();
  const vue = useRef<WebView>(null);
  // Page rendue (widget prêt à être relancé) ; sinon une relance recrée la WebView.
  const rendu = useRef(false);
  const [generation, setGeneration] = useState(0);
  const { visible, traiter, montrer } = useEvenementsTurnstile(props);
  const html = useMemo(() => page(t.scheme), [t.scheme]);

  function recharger() {
    rendu.current = false;
    props.onJeton(null);
    montrer(false);
    setGeneration((g) => g + 1);
  }

  useImperativeHandle(ref, () => ({
    relancer() {
      if (!rendu.current) return recharger();
      props.onJeton(null);
      vue.current?.injectJavaScript('window.rencarRelancer && window.rencarRelancer(); true;');
    },
  }));

  return (
    <View
      style={{ height: visible ? HAUTEUR_WIDGET : 0, overflow: 'hidden' }}
      className={visible ? 'mb-3' : ''}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>
      <WebView
        // Thème changé ou relance après une panne : nouvelle page, nouveau widget.
        key={`${t.scheme}-${generation}`}
        ref={vue}
        source={{ html, baseUrl: ORIGINE_WIDGET }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        style={{ height: HAUTEUR_WIDGET, backgroundColor: 'transparent' }}
        containerStyle={{ backgroundColor: 'transparent' }}
        accessibilityLabel="Vérification anti-robot de Cloudflare"
        onMessage={(e) => {
          const m = lire(e);
          if (!m) return;
          if (m.type === 'pret') rendu.current = true;
          traiter(m);
        }}
        onShouldStartLoadWithRequest={garderLaPage}
        onOpenWindow={(e) => void ouvrirPage(e.nativeEvent.targetUrl)}
        onError={() => traiter({ type: 'chargement' })}
        // Processus de la WebView arrêté par le système : la page est perdue, on la recrée.
        onContentProcessDidTerminate={recharger}
        onRenderProcessGone={recharger}
      />
    </View>
  );
}
