# Campus Live web

Next.js 16 (App Router). The live campus map, the camera list by section, and the assistant, in Turkish.
Data comes only from the API (`@campus-live/client`): the first load over REST, then live over Socket.IO.

```bash
cp .env.example .env.local      # NEXT_PUBLIC_API_URL: public, never a key
npm run dev -w @campus-live/web # http://localhost:3000 (start the API and vision first)
npm run build -w @campus-live/web
```

The map uses OpenStreetMap tiles (attribution shown), loaded in the browser only. Every reading not
from a permitted camera is labelled "Demo"; a camera silent for 15 s turns grey.
