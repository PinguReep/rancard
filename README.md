# Rencar

Application iOS de gestion de garage (Expo SDK 57, React Native, Expo Router, NativeWind).

Ce dépôt est une copie publique limitée à l'app mobile. Il sert à la compiler sur les runners macOS de GitHub et à l'envoyer sur TestFlight. Le développement, le backend et la documentation se trouvent ailleurs. Les données de démonstration sont entièrement fictives.

```bash
cd mobile
npm ci
npm run web    # aperçu web en mode démonstration
```

- `.github/workflows/ci.yml` : TypeScript et export web à chaque PR.
- `.github/workflows/ios-testflight.yml` : build iOS (`eas build --local`) puis envoi TestFlight (`eas submit`), sur un tag `ios-v*` ou à la main.

Tous droits réservés : publié pour être lu, pas réutilisé (voir `LICENSE`). Signaler une vulnérabilité : voir `SECURITY.md`.
