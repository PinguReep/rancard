import '@/global.css';
import '@/theme/interop';
import '@/lib/push';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { useSession } from '@/state/session';
import { palette } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Racine : thème, gestes, clavier, garde d'authentification.
 *
 * Les écrans « app » ne sont montés qu'avec une session ; les écrans
 * « auth » seulement sans. Expo Router gère la redirection.
 */
export default function RootLayout() {
  const scheme = useColorScheme();
  const session = useSession((s) => s.session);
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
    <GestureHandlerRootView style={{ flex: 1 }}>
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
                name="notifications"
                options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, headerShown: false }}
              />
              <Stack.Screen name="nouvelle-intervention" options={{ presentation: 'modal', headerShown: false }} />
              <Stack.Screen name="profil" options={{ presentation: 'modal', headerShown: false }} />
            </Stack.Protected>
            <Stack.Protected guard={session === null}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
          </Stack>
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
