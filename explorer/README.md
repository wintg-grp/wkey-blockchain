# WINTG Scan

Official block explorer for the WINTG L1 chain.

- **Stack** — Next.js 14 (App Router), TypeScript, Tailwind CSS, viem
- **Visuals** — Three.js / react-three-fiber animated background, dark UI with the WINTG `#FF6A1A` accent
- **Networks** — mainnet (chain 2280) and testnet (chain 22800), switchable from the header
- **No database** — pages query the chain RPC directly. Suitable for early-stage traffic; an indexer will be added when transaction history needs deeper queries.

## Run locally

```bash
cd explorer
cp .env.example .env.local
npm install
npm run dev
# open http://localhost:3001
```

By default the dev server queries the public WINTG endpoints. Override the
RPC URLs in `.env.local` if you want to point at a local Besu instance.

## Build for production

```bash
npm run build
npm run start   # serves on port 3001
```

The Next.js `output: "standalone"` mode keeps the deploy small — only the
required `node_modules` get bundled.

## Layout

```
explorer/
├── public/
│   └── favicon.svg          (replace with brand SVG when ready)
├── src/
│   ├── app/
│   │   ├── layout.tsx       Root layout, fonts, metadata
│   │   ├── page.tsx         Homepage (hero + stats + live feed)
│   │   ├── globals.css      Tailwind base + WINTG tokens
│   │   ├── not-found.tsx    404 page
│   │   ├── block/[number]/page.tsx
│   │   ├── tx/[hash]/page.tsx
│   │   └── address/[addr]/page.tsx
│   ├── components/
│   │   ├── HeroBackground.tsx     Three.js particle field + wireframe
│   │   ├── Header.tsx             Logo + search + network switcher
│   │   ├── Footer.tsx             Social links + copyright
│   │   ├── Logo.tsx
│   │   ├── NetworkSwitcher.tsx    mainnet ↔ testnet
│   │   ├── SearchBar.tsx          Universal block/tx/address search
│   │   ├── StatsGrid.tsx          Latest block, gas, block time
│   │   ├── LatestBlocks.tsx       Live feed
│   │   ├── LatestTransactions.tsx Live feed
│   │   ├── DetailRow.tsx
│   │   └── AddressLink.tsx
│   └── lib/
│       ├── networks.ts      Chain definitions (viem)
│       ├── rpc.ts           PublicClient cache
│       └── format.ts        Address shortening, WTG formatting, etc.
├── tailwind.config.ts
├── next.config.js
├── tsconfig.json
└── package.json
```

## Brand placeholder

Until the official logo lands, the header renders an "W" tile in the WINTG
gradient. Drop a `logo.png` (or any image) into `public/` and set
`NEXT_PUBLIC_LOGO_URL=/logo.png` in `.env.local` to swap it in.

## Deployment

The explorer runs as a single Node process on port `3001` and is fronted by
the OpenLiteSpeed reverse proxy already configured for `scan.wintg.network`
(see `scripts/da-templates/openlitespeed_vhost.conf.snippet`).

Recommended `systemd` unit (paste into `/etc/systemd/system/wintg-scan.service`):

```ini
[Unit]
Description=WINTG Scan — block explorer
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/wkey-blockchain/explorer
Environment=NODE_ENV=production
Environment=PORT=3001
ExecStart=/usr/bin/node /opt/wkey-blockchain/explorer/.next/standalone/server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
cd /opt/wkey-blockchain/explorer
npm install --production=false
npm run build
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static
systemctl enable --now wintg-scan
```

Then `https://scan.wintg.network` will be live, both networks reachable from
the same URL with the in-app switcher.

## License

Apache-2.0 (same as the parent repository).
