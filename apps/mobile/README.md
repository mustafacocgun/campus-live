# Campus Live mobile

Expo SDK 58 (React Native, expo-router). Two tabs: **Harita**, the live campus map, and **Asistan**, which
answers questions from the live data. Data comes only from the API through `@campus-live/client`.

```bash
cp .env.example .env            # EXPO_PUBLIC_API_URL = this computer's LAN address, e.g. http://192.168.1.20:4000
npm run start -w @campus-live/mobile   # scan the QR code with Expo Go (phone and computer on the same Wi-Fi)
```

A phone cannot reach the computer as `localhost`; the map shows a warning if the address is wrong.
`EXPO_PUBLIC_*` values ship inside the app, so never put a key there.
