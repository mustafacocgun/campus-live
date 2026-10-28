# Campus Live web

Next.js 16 (App Router). The live campus map, the places by kind and section, and the assistant, in
Turkish. Data comes only from the API (`@campus-live/client`): the places and the first snapshot over
REST, then a snapshot every second over Socket.IO. No camera is ever shown or sent here (CLAUDE.md §0.2).

```bash
cp .env.example .env.local      # NEXT_PUBLIC_API_URL: public, never a key
npm run dev -w @campus-live/web # http://localhost:3000 (start the API and vision first)
npm run build -w @campus-live/web
```

The map is OpenFreeMap Liberty (attribution shown), loaded in the browser only: in 3D with the 2D
switch (2D first under reduced motion), and in dark mode the same style darkened by `darkStyle` in
`@campus-live/client`. It draws the heat, buildings lit by their crowd, parking lots and roads in
their level's color, and each place's name and value. Every value not from a permitted camera is
labelled "Demo"; a place without fresh data, or every place when snapshots stop for 15 s, turns grey.
