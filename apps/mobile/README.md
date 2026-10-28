# Campus Live mobile

Expo SDK 58 (React Native, expo-router), in the web app's colors and both themes. Four tabs over the
same live data:

- **Harita**: the live campus map on OpenFreeMap Liberty, in 3D or flat (the crowd's heat cloud,
  buildings lit by their crowd, parking lots and roads in their level's color, each place's name and
  value; never a camera), the topic filters, and the tapped place's card.
- **Yerler**: the summary cards, search, filters and the live list; a place's detail with this
  session's chart and the nearest free lot.
- **Asistan**: questions about the live data, with the user's position (device or picked on the map).
- **Hesap**: sign-in with a school e-mail, the inbox and the place alerts.

Data comes only from the API through `@campus-live/client`.

## Runs in Expo Go

The map is MapLibre GL JS in a WebView (`src/components/map-html.ts`), so Expo Go shows it; no
development build is needed. The page loads MapLibre from unpkg and the basemap from OpenFreeMap, so
the phone needs internet as well as the computer's Wi-Fi.

```bash
cp .env.example .env            # EXPO_PUBLIC_API_URL = this computer's LAN address, e.g. http://192.168.1.20:4000
npm run start -w @campus-live/mobile   # scan the QR code with Expo Go (phone and computer on the same Wi-Fi)
```

A phone cannot reach the computer as `localhost`; the app shows a warning if the address is wrong.
`EXPO_PUBLIC_*` values ship inside the app, so never put a key there. Expo web cannot show the map
(react-native-webview has no web version); the web map is `apps/web`.
