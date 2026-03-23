# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MineGNK** is a **landing page** for Gcore's GPU mining offering on the Gonka network.

**Key Principle**: Next.js landing page with server-side API routes for fetching live Gonka network data, and HubSpot form integration for lead capture.

## Architecture

```
+------------------+
| Browser          |
+--------+---------+
         |
         v
+--------+---------+
| Next.js 16       |
| Standalone       |
+--------+---------+
    |         |
    v         v
+-------+  +------------------+
| API   |  | HubSpot Forms    |
| Routes|  | Lead Capture     |
+---+---+  +------------------+
    |
    v
+------------------+
| Gonka Network    |
| (External APIs)  |
+------------------+
```

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Styling**: Tailwind CSS v4
- **Animations**: Motion (Framer Motion)
- **i18n**: next-intl (EN/RU/ZH)
- **Forms**: HubSpot embedded forms (EU1 region)

## Project Structure

```
/minegnk
  next-frontend/
    src/
      app/
        [locale]/           # i18n routes
          layout.tsx        # Root layout with providers
          page.tsx          # Landing page
          request-gpu/      # HubSpot form page
            page.tsx
            RequestGpuClient.tsx
        api/                # API routes (server-side)
          gpu-weights/      # GPU efficiency data from Gonka
            route.ts
          network-status/   # Chain status & epoch data
            route.ts
        globals.css         # Tailwind + custom styles
      components/
        landing/            # Landing page sections
          Header.tsx
          HeroSection.tsx
          FeaturesSection.tsx
          ForWho.tsx
          EfficiencySection.tsx
          HowItWorks.tsx
          ManagedServices.tsx
          ServiceAddon.tsx
          PricingSection.tsx
          FaqSection.tsx
          Footer.tsx
        ui/                 # Reusable UI components
          MotionReveal.tsx  # Scroll-triggered animations
          NetworkStatus.tsx # Live network status monitoring
        icons/              # SVG icons
      data/                 # Static/fallback data
        pricing.ts
        efficiency.ts       # Fallback GPU efficiency data
      i18n/                 # Internationalization config
      lib/hooks/            # Custom React hooks
    messages/               # Translation files (en.json, ru.json, zh.json)
    Dockerfile             # Multi-stage build (Node.js runtime)
    docker-compose.yml     # Port 8000
  .claude/
    agents/                 # AI agents
    skills/                 # nextjs, nextjs-anti-patterns, tailwindcss, context7
  CLAUDE.md
  README.md
```

## Core Features

### Landing Page
- **Public Access**: No authentication
- Dark theme with Tailwind CSS v4 (oklch colors)
- Sections: Hero, Stats, Features, For Who, Efficiency, How It Works, Managed Services, Service Addon, Pricing, FAQ
- Language switcher (EN/RU/ZH)
- **HubSpot Form Integration**: "Rent GPU" buttons open modal with embedded form
- **Network Status Monitoring**: Live Gonka network status ticker in header

### API Routes

Server-side API routes fetch live data from Gonka network:

| Route | Purpose | Source | Cache |
|-------|---------|--------|-------|
| `/api/gpu-weights` | GPU efficiency data | Gonka participants + hardware nodes | 60s |
| `/api/network-status` | Chain status & epoch | Gonka chain-rpc + epoch API | No cache |

Both routes have fallback to static data when external APIs are unavailable.

### Static/Fallback Data
Fallback data is in `src/data/` folder:
- `pricing.ts` - GPU pricing data
- `efficiency.ts` - Fallback GPU efficiency metrics

### Design System

**Typography**
- `font-heading` (Outfit) - Used for all h1/h2 headings
- `font-body` (Inter) - Body text

**CSS Utilities** (in `globals.css`):
- `.cta-glow` - Pulsing glow animation for CTAs
- `.glass-card` - Glass morphism card effect
- `.text-gradient` - Orange gradient text
- `.page-grid` - Subtle background grid pattern

**Animation Components** (`ui/MotionReveal.tsx`):
- `MotionReveal` - Scroll-triggered fade-in with direction
- `MotionStagger` - Container for staggered child animations
- `MotionItem` - Child item for stagger animations
- `MotionScale` - Scale-up animation on scroll

**Network Status Component** (`ui/NetworkStatus.tsx`):
- Live monitoring of Gonka blockchain network
- Real-time metrics: block height, block age, current epoch
- Auto-refresh every 20 seconds with manual refresh option
- Status indicators: Live (green), Syncing (amber), Stale (red), Unknown (gray)
- Responsive design with progressive metric hiding on smaller screens
- Hydration-safe (renders placeholders during SSR)

## Development Commands

```bash
cd next-frontend
npm install
npm run dev        # http://localhost:3000
npm run build      # Standalone build to .next/standalone
npm run start      # Serve production build
```

## Docker Deployment

**Production host**: `revops-vm1` (`ed-c16-61-125-69`), accessible via Cloudflare tunnel.

```bash
cd next-frontend
docker compose up -d --build   # Build and run on port 8000
docker compose logs -f         # View logs
docker compose down            # Stop
```

Access at **http://localhost:8000**

## CI/CD

### Workflow File

`.github/workflows/ci.yml` — runs on every push to `main` and on pull requests targeting `main`.

### Jobs

| Job | Trigger | Steps |
|-----|---------|-------|
| `ci` | push to main, PRs | checkout → Node 22 setup → `npm ci` → lint → test → build |
| `deploy` | push to main only (after `ci` passes) | Uses `mine` environment → SSH into VM → `git pull` → `docker compose up -d --build` → `docker image prune -f` |

### Deploy Flow

```
push to main
     │
     ▼
ci job passes (lint + test + build)
     │
     ▼
deploy job SSHes into revops-vm1
     │
     ├── cd ~/Mine && git pull
     ├── cd next-frontend
     ├── sudo docker compose up -d --build
     └── sudo docker image prune -f
```

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `VM_HOST` | Production VM hostname or IP (`ed-c16-61-125-69`) |
| `VM_USER` | SSH username on the VM |
| `VM_SSH_KEY` | Private SSH key for authentication |

These secrets live in the **`mine`** GitHub environment. Set them in **GitHub → Settings → Environments → mine → Environment secrets**.

### Notes

- The `deploy` job only runs on `push` events to `main`, never on PRs.
- Docker images are pruned after each deploy to reclaim disk space.
- The working directory for the CI job is `next-frontend` (set via `defaults.run.working-directory`).

## Testing

### Running Tests

```bash
cd next-frontend
npm test                          # Run all tests
npm run test:coverage             # Run with coverage report
npm run test:coverage -- --ci     # CI mode (used in GitHub Actions)
```

### Test Suites

13 test suites, 141 tests total. All must pass before a PR can be merged.

| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `src/app/api/gpu-weights/__tests__/route.test.ts` | 17 | Efficiency calculation, GPU aggregation, fallback to static data, 60s cache header |
| `src/app/api/network-status/__tests__/route.test.ts` | 9 | Status determination (Live/Syncing/Stale/Unknown), block age, epoch extraction |
| `src/app/[locale]/request-gpu/__tests__/RequestGpuClient.test.tsx` | 10 | GPU mapping, loading/error states, URL param pre-fill |
| `src/lib/gonka/__tests__/fetch.test.ts` | 5 | `fetchWithTimeout` utility — timeout behavior, error handling |
| `src/components/landing/__tests__/Header.test.tsx` | 6 | Nav links, mobile menu toggle, accessibility |
| `src/app/__tests__/sitemap.test.ts` | 5 | Sitemap URL generation per locale, priorities |
| `src/app/__tests__/robots.test.ts` | 3 | Robots rules, sitemap link |
| `src/components/ui/__tests__/NetworkStatus.test.tsx` | — | API response parsing, status logic, responsive behavior, auto-refresh |

### Coverage

Current thresholds (enforced via `jest.config.js`):

| Metric | Threshold | Actual |
|--------|-----------|--------|
| Statements | 45% | ~46% |
| Branches | 45% | ~48% |
| Functions | 30% | ~33% |
| Lines | 45% | ~47% |

Thresholds are intentionally modest — many landing page components are static markup with no testable logic.

### Test Environments

API route tests use `@jest-environment node` (set per-file via docblock). All other tests use the default `jsdom` environment. Browser-only mocks in `jest.setup.js` are guarded with `typeof window !== 'undefined'` to avoid errors in the Node environment.

### Coverage Reporting in CI

The CI workflow runs `npm run test:coverage -- --ci` and uses the `MishaKav/jest-coverage-comment` action to post a coverage summary as a PR comment.

### Config Files

| File | Purpose |
|------|---------|
| `jest.config.js` | Jest config — environment, path aliases, coverage reporters and thresholds |
| `jest.setup.js` | Global test setup — browser API mocks (guarded for Node environment) |

## Git Workflow

```
<type>: <short description>
```

Types: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`

**Rules:**
- No "Generated with Claude Code" or "Co-Authored-By" lines
- Keep messages concise

## HubSpot Integration

### Configuration

Form credentials (hardcoded in `RequestGpuClient.tsx`):

| Portal ID | Form ID | Region |
|-----------|---------|--------|
| 4202168 | 0d64ead5-78c5-4ccb-84e3-3c088a10b212 | eu1 |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ PricingSection                                              │
│ - "Request GPU" buttons link to /request-gpu?gpu=...        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ /request-gpu page (RequestGpuClient.tsx)                    │
│ - Dedicated page with HubSpot form                          │
│ - Reads ?gpu= param and pre-fills form                      │
│ - Uses DECLARATIVE embed (hs-form-frame)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ HubSpot Declarative Embed Script                            │
│ https://js-eu1.hsforms.net/forms/embed/{PORTAL_ID}.js       │
│ - Processes elements with class "hs-form-frame"             │
│ - Works on localhost (no domain whitelist required)         │
└─────────────────────────────────────────────────────────────┘
```

### Embed Method: Declarative (hs-form-frame)

**Why declarative instead of programmatic (v2.js)?**
- Programmatic API (`hbspt.forms.create()`) requires domain whitelist in HubSpot settings
- Returns 403 Forbidden on localhost/non-whitelisted domains
- Declarative embed works without domain restrictions

```html
<!-- Script (loaded dynamically) -->
<script src="https://js-eu1.hsforms.net/forms/embed/4202168.js" defer></script>

<!-- Form container (processed by script) -->
<div class="hs-form-frame"
     data-region="eu1"
     data-form-id="0d64ead5-78c5-4ccb-84e3-3c088a10b212"
     data-portal-id="4202168">
</div>
```

### GPU Pre-fill via URL Parameters

When user clicks "Request GPU" on a pricing card:
1. User is navigated to `/request-gpu?gpu=NVIDIA%20H100`
2. `RequestGpuClient` reads the `gpu` param and calls `addGpuToUrlParams()`
3. URL is updated with HubSpot pre-fill params:
   ```
   /request-gpu?gpu=NVIDIA%20H100&form_gonka_preffered_configuration=8%20x%20H100&form_gonka_servers_number=1
   ```
4. HubSpot form reads these parameters and pre-selects the GPU field

**GPU mapping** (in `RequestGpuClient.tsx`):
| GPU Name Contains | HubSpot Value |
|-------------------|---------------|
| A100 | 8 x A100 |
| H100 | 8 x H100 |
| H200 | 8 x H200 |
| B200 | 8 x B200 |

### Page Behavior

- **Dedicated page**: Form lives at `/[locale]/request-gpu`
- **Loading states**: Shows spinner while form loads, error state with retry button
- **Form recreation**: Uses MutationObserver to detect when form is ready
- **Timeout**: 10-second timeout triggers error state with retry option

### Key Files

| File | Purpose |
|------|---------|
| `src/app/[locale]/request-gpu/page.tsx` | Server component, sets locale |
| `src/app/[locale]/request-gpu/RequestGpuClient.tsx` | Client component with form logic |
| `src/components/landing/PricingSection.tsx` | Links to `/request-gpu?gpu=...` |

### Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| 403 Forbidden | Using v2.js programmatic API | Use declarative embed (hs-form-frame) |
| Form not loading | Script blocked or timeout | Check network tab, retry button |
| GPU not pre-filled | URL params not set | Check `addGpuToUrlParams()` function |
| Form stuck loading | MutationObserver not triggering | Check if form/iframe element exists |

## Network Status Monitoring

### Overview
Live network status ticker integrated into the header that displays real-time Gonka blockchain metrics.

### API Route

The NetworkStatus component fetches from `/api/network-status` which proxies to:

| External Endpoint | Purpose | Data Used |
|----------|---------|-----------|
| `http://202.78.161.32:8000/chain-rpc/status` | Chain status | Block height, block time, catching_up flag |
| `http://202.78.161.32:8000/v1/epochs/current/participants` | Epoch data | Current epoch ID from `active_participants.epoch_id` |

### Status Logic

| Status | Condition | Indicator Color |
|--------|-----------|-----------------|
| Live | Block age ≤ 120s AND not catching up | Green (emerald) |
| Syncing | Chain is catching up | Amber |
| Stale | Block age > 120s | Red |
| Unknown | API error or no data | Gray (zinc) |

### Features

- **Auto-refresh**: Polls every 20 seconds
- **Manual refresh**: Refresh button with loading animation
- **Responsive metrics**: Progressively hidden on smaller screens
  - Mobile: Status indicator only
  - sm (640px+): + Block height
  - md (768px+): + Block age
  - lg (1024px+): + Epoch
- **Animated status indicator**: Pulsing dot with color-coded states
- **Last updated time**: Shows when data was last fetched
- **Hydration-safe**: No layout shift during SSR/client hydration

### Integration

Located in Header component as a sub-header strip below the main navigation bar.

```tsx
<header className="sticky top-0 inset-x-0 w-full z-50">
  {/* Main Navigation Bar */}
  <div className="h-14 bg-background/80 backdrop-blur-md border-b border-border/50">
    {/* Navigation content */}
  </div>

  {/* Network Status Strip */}
  <NetworkStatus />
</header>
```

### Testing

Test file: `src/components/ui/__tests__/NetworkStatus.test.tsx`

Tests cover API response parsing, status logic, responsive behavior, error handling, and auto-refresh. The file was rewritten to match the current `/api/network-status` response format (the component no longer calls the Gonka endpoint directly).

### Key Files

| File | Purpose |
|------|---------|
| `src/components/ui/NetworkStatus.tsx` | Network status component |
| `src/components/landing/Header.tsx` | Integration point (includes NetworkStatus) |
| `src/components/ui/__tests__/NetworkStatus.test.tsx` | Unit tests |

## Key Decisions

1. **Standalone Output**: Node.js server with API routes for live data fetching
2. **Next.js 16**: App Router with standalone build
3. **Server-Side Data Fetching**: API routes proxy Gonka network calls with caching and fallback
4. **HubSpot Integration**: External form for lead capture
5. **i18n**: next-intl with EN/RU/ZH translations
6. **Tailwind CSS v4**: All styling via utility classes with oklch colors
7. **Docker**: Node.js runtime (not nginx) for API route support
8. **GitHub Actions CI/CD**: Automated lint/test/build on PRs, auto-deploy to VM on merge to main

## Local AI Agents & Skills

### Active Agents

| Agent | Use For |
|-------|---------|
| `code-review-agent` | Code quality, security |
| `refactor-agent` | Split files, extract components |
| `testing-agent` | Unit tests |
| `project-doc-agent` | Documentation updates |

### Active Skills

| Skill | Use For |
|-------|---------|
| `context7` | Fetch library documentation (Motion, Next.js, etc.) |
| `nextjs` | Next.js 16 App Router patterns, Server/Client Components |
| `nextjs-anti-patterns` | Detect/fix common Next.js mistakes |
| `tailwindcss` | Tailwind CSS v4 styling, responsive design, dark mode |
| `frontend-design` | UI/UX improvements, visual polish |
