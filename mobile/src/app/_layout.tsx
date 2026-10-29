import '@/lib/sonnerie/demarrage';
import '@/global.css';
import '@/theme/interop';
import '@/lib/push';
import '@/theme/apparence';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { GestionnaireAppels } from '@/components/sonnerie/GestionnaireAppels';
import { noterAppui } from '@/components/ui/dernier-appui';
import { SONNERIE_INCLUSE } from '@/lib/sonnerie/inclusion';
import { useSession } from '@/state/session';
import { palette } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Racine : thème, gestes, clavier, garde d'authentification.
 *
 * Les écrans « app » ne sont montés qu'avec une session ; l'écran
 * d'attente seulement pour une demande d'inscription pas encore validée ;
 * les écrans « auth » sinon. Expo Router gère la redirection.
 */
export default function RootLayout() {
  const scheme = useColorScheme();
  const session = useSession((s) => s.session);
  const enAttente = useSession((s) => s.demande !== null);
  const demarrer = useSession((s) => s.demarrer);

  useEffect(() => {
    void demarrer();
  }, [demarrer]);

  useEffect(() => {
    if (session !== undefined) SplashScreen.hideAsync().catch(() => {});
  }, [session]);

  const sombre = scheme === 'dark';
  const p = sombre ? palette.dark : palette.light;
  const theme = {
    ...(sombre ? DarkTheme : DefaultTheme),
    colors: {
      ...(sombre ? DarkTheme : DefaultTheme).colors,
      primary: p.accent,
      background: p.bg,
      card: p.surface,
      text: p.ink,
      border: p.line,
      notification: p.danger,
    },
  };

  // Reprise de session en cours : le splash natif couvre l'écran sur iOS et
  // Android ; sur le web, un fond de la bonne couleur et un indicateur.
  if (session === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, justifyContent: 'center' }}>
        {Platform.OS === 'web' ? <ActivityIndicator color={p.muted} /> : null}
      </View>
    );
  }

  return (
    // Chaque appui remonte ici : un avis à bouton se pose loin du doigt (components/ui/dernier-appui.ts ; web : pointerdown).
    <GestureHandlerRootView style={{ flex: 1 }} onTouchStart={Platform.OS === 'web' ? undefined : (e) => noterAppui(e.nativeEvent.pageY)}>
      <KeyboardProvider>
        <ThemeProvider value={theme}>
          <StatusBar style={sombre ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerShown: false,
              headerTintColor: p.accent,
              headerTitleStyle: { color: p.ink },
              headerStyle: { backgroundColor: p.bg },
              contentStyle: { backgroundColor: p.bg },
            }}>
            <Stack.Protected guard={session !== null}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="intervention/[id]"
                options={{ headerShown: true, headerTitle: '', headerBackTitle: 'Retour', headerTransparent: Platform.OS === 'ios', headerBlurEffect: 'regular' }}
              />
              <Stack.Screen
                name="client/[id]"
                options={{ headerShown: true, headerTitle: '', headerBackTitle: 'Retour', headerTransparent: Platform.OS === 'ios', headerBlurEffect: 'regular' }}
              />
              <Stack.Screen
                name="appel/[id]"
                options={{ headerShown: true, headerTitle: '', headerBackTitle: 'Retour', headerTransparent: Platform.OS === 'ios', headerBlurEffect: 'regular' }}
              />
              <Stack.Screen
                name="activite"
                options={{ headerShown: true, headerTitle: '', headerBackTitle: 'Retour', headerTransparent: Platform.OS === 'ios', headerBlurEffect: 'regular' }}
              />
              <Stack.Screen
                name="notifications"
                options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, headerShown: false }}
              />
              <Stack.Screen name="nouvelle-intervention" options={{ presentation: 'modal', headerShown: false }} />
              <Stack.Screen name="profil" options={{ presentation: 'modal', headerShown: false }} />
              <Stack.Screen name="ecran-appel" options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }} />
            </Stack.Protected>
            {/* Compte créé dans l’app, pas encore validé par Rencar : rien d’autre que l’attente. */}
            <Stack.Protected guard={session === null && enAttente}>
              <Stack.Screen name="attente" />
            </Stack.Protected>
            <Stack.Protected guard={session === null && !enAttente}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
          </Stack>
          {/* Sonnerie dans l’app : « Rencar Test » seulement (absente de la version 1 de l’App Store). */}
          {session && SONNERIE_INCLUSE ? <GestionnaireAppels /> : null}
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
