# Brand assets

Drop your real PNGs here. The brand page (`/brand`) and the header
will pick them up automatically. Until you upload them, the SVGs in
this folder are used as fallbacks.

## Files expected

| Filename | What it is | Background it sits on |
|---|---|---|
| `logo.png` | Master mark used in the header | Any |
| `logo-orange.png` | Orange mark on a transparent / cream background | Light surfaces |
| `logo-white.png` | White mark on a transparent / coloured background | Dark or branded surfaces |
| `favicon-orange.png` | Square favicon, orange on white | Tabs (light theme) |
| `favicon-white.png` | Square favicon, white on orange | Tabs (dark theme) |

Recommended dimensions:

- `logo*.png` — 1024 × 1024 (square) or 1024 × 256 (wordmark)
- `favicon*.png` — 512 × 512

The brand page reads file URLs from environment variables. In
`.env.local` you can override them per file:

```
NEXT_PUBLIC_LOGO_URL=/brand/logo.png
NEXT_PUBLIC_BRAND_LOGO_ORANGE=/brand/logo-orange.png
NEXT_PUBLIC_BRAND_LOGO_WHITE=/brand/logo-white.png
NEXT_PUBLIC_BRAND_FAVICON_ORANGE=/brand/favicon-orange.png
NEXT_PUBLIC_BRAND_FAVICON_WHITE=/brand/favicon-white.png
```
