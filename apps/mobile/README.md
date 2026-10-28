# Campus Live mobile

Expo SDK 58 (React Native, expo-router). Two tabs: **Harita**, the live campus map on OpenFreeMap
Liberty, in 3D or flat (the crowd's heat cloud, buildings lit by their crowd, parking lots and roads in
their level's color, each place's name and value; never a camera), and **Asistan**, which answers
questions from the live data. Data comes only from the API through `@campus-live/client`.

## A development build, not Expo Go

The map is MapLibre React Native, native code that Expo Go does not contain. Build the app once, then
it loads the JavaScript from your computer like Expo Go did.

- **Android Studio (no account):** install Android Studio (its SDK and platform tools), plug in a phone
  with USB debugging on (or start an emulator), then from `apps/mobile`: `npx expo run:android`. It
  builds and installs a debug app (several minutes the first time).
- **EAS Build (cloud):** needs an Expo account and the `expo-dev-client` package with a `development`
  profile in `eas.json`. Adding them is the team's call (CLAUDE.md §0.6).

Then, for every session:

```bash
cp .env.example .env            # EXPO_PUBLIC_API_URL = this computer's LAN address, e.g. http://192.168.1.20:4000
npm run start -w @campus-live/mobile   # open the installed Campus Live app (phone and computer on the same Wi-Fi)
```

A phone cannot reach the computer as `localhost`; the map shows a warning if the address is wrong.
`EXPO_PUBLIC_*` values ship inside the app, so never put a key there. Expo web cannot show the map
(MapLibre React Native has no web version); the web map is `apps/web`.
