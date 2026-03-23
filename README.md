# MineGNK

Static landing page for Gcore's GPU mining offering on the Gonka network.

## Overview

MineGNK is a marketing landing page that allows visitors to:
- Learn about GPU mining as a service
- View GPU pricing (A100, H100, H200, B200)
- Submit rental inquiries via HubSpot forms

**Key Principle**: Fully static site with no backend. Lead capture via HubSpot.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS v4 |
| i18n | next-intl (EN/RU/ZH) |
| Forms | HubSpot embedded forms |
| Network Monitoring | Gonka blockchain APIs |
| Deployment | Static export |

## Quick Start

```bash
cd next-frontend
npm install
npm run dev      # http://localhost:3000
```

## Project Structure

```
/minegnk
├── next-frontend/          # Next.js static site
│   ├── src/
│   │   ├── app/[locale]/   # i18n routes
│   │   ├── components/
│   │   │   ├── landing/    # Page sections
│   │   │   ├── ui/         # Reusable components
│   │   │   └── icons/      # SVG icons
│   │   ├── i18n/           # Internationalization
│   │   └── lib/hooks/      # Custom hooks
│   ├── messages/           # Translations (en.json, ru.json)
│   └── out/                # Static build output
└── .claude/                # AI agent configs
```

## Available Scripts

```bash
cd next-frontend

npm run dev        # Start dev server (localhost:3000)
npm run build      # Static export to /out
npm run start      # Serve production build
```

## HubSpot Integration

Form configuration is hardcoded in `src/app/[locale]/request-gpu/RequestGpuClient.tsx`:

| Portal ID | Form ID | Region |
|-----------|---------|--------|
| 4202168 | 0d64ead5-78c5-4ccb-84e3-3c088a10b212 | eu1 |

## Landing Page Sections

**Header**
- Navigation with language switcher (EN/RU/ZH)
- Live network status ticker (block height, age, epoch)
- "Rent GPU" CTA button

**Main Sections**
1. **Hero** - Value proposition with animated badge
2. **Network Stats** - Gonka network overview
3. **Efficiency** - GPU efficiency comparison
4. **For Who** - Target audience
5. **Features** - Why mine with us
6. **How It Works** - Onboarding process
7. **Managed Services** - What Gcore handles
8. **Pricing** - GPU tiers with HubSpot form trigger
9. **Service Addon** - Additional services
10. **FAQ** - Common questions
11. **Footer** - Links and copyright

## Network Status Monitoring

Live ticker in header showing real-time Gonka blockchain metrics:

- **Status**: Live (green), Syncing (amber), Stale (red), or Unknown (gray)
- **Block Height**: Latest block number
- **Block Age**: Time since last block
- **Epoch**: Current network epoch
- **Auto-refresh**: Every 20 seconds
- **Responsive**: Metrics progressively hidden on smaller screens

**API Endpoints**:
- Chain status: `https://node4.gonka.ai/chain-rpc/status`
- Epoch data: `https://node4.gonka.ai/v1/epochs/current/participants`

Both APIs support CORS without proxy requirements.

## Deployment

### Static Export

```bash
npm run build    # Generates /out directory
```

Deploy the `/out` directory to any static hosting (Vercel, Netlify, S3, etc.).

### Docker

```bash
cd next-frontend
docker compose up -d --build   # Build and run on port 8000
```

Access at http://localhost:8000

## CI/CD

GitHub Actions runs automatically on every push and pull request.

### Pipeline

| Job | Runs on | Steps |
|-----|---------|-------|
| `ci` | Push to main, all PRs | Install → Lint → Test (with coverage) → Build |
| `deploy` | Push to main only (after CI passes) | SSH into VM → git pull → docker compose up |

### Workflow

```
PR opened → ci job runs (lint + test + build)
push to main → ci job passes → deploy job runs
```

The deploy job SSHes into `revops-vm1`, pulls the latest code, rebuilds the Docker image, and prunes old images.

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `VM_HOST` | Production VM IP/hostname |
| `VM_USER` | SSH username |
| `VM_SSH_KEY` | Private SSH key |

These secrets live in the **`mine`** GitHub environment. Configure them in **GitHub → Settings → Environments → mine → Environment secrets**.

## Testing

```bash
cd next-frontend
npm test                      # Run all tests
npm run test:coverage         # Run with coverage report
```

13 test suites, 141 tests covering API routes, components, and utilities.

| Area | Test File |
|------|-----------|
| GPU weights API | `src/app/api/gpu-weights/__tests__/route.test.ts` |
| Network status API | `src/app/api/network-status/__tests__/route.test.ts` |
| HubSpot form page | `src/app/[locale]/request-gpu/__tests__/RequestGpuClient.test.tsx` |
| Fetch utility | `src/lib/gonka/__tests__/fetch.test.ts` |
| Header component | `src/components/landing/__tests__/Header.test.tsx` |
| Sitemap | `src/app/__tests__/sitemap.test.ts` |
| Robots.txt | `src/app/__tests__/robots.test.ts` |
| Network status component | `src/components/ui/__tests__/NetworkStatus.test.tsx` |

Coverage thresholds are enforced at 45% statements/branches/lines and 30% functions. The CI workflow posts a coverage summary comment on every PR.

## Development

### Git Workflow

```bash
# Commit message format
<type>: <short description>

# Types: feat, fix, refactor, docs, style, test, chore
```

### Code Style

- TypeScript strict mode
- React functional components
- Tailwind CSS utilities
- oklch color values for dark theme

## License

UNLICENSED - Private project
