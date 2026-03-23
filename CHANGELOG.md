# Changelog

All notable changes to this project are documented here.

Format: `[YYYY-MM-DD] type: description`

---

## [2026-03-23]

### Added

- `ci: add GitHub Actions CI/CD with deploy to VM` (commit `cfd8fb5`)
  - `.github/workflows/ci.yml` — two-job pipeline:
    - `ci` job: runs on every push to `main` and on PRs — installs deps (Node 22), lints, runs tests, builds
    - `deploy` job: runs only on push to `main` after CI passes — SSHes into `revops-vm1`, pulls latest code, rebuilds Docker image (`docker compose up -d --build`), prunes old images
  - Required GitHub secrets: `VM_HOST`, `VM_USER`, `VM_SSH_KEY`

- `feat: add robots.txt and sitemap.xml` (commit `5137e1b`)
  - SEO foundations for the landing page

### Changed

- `fix: update pricing subtitle to clarify setup/monitoring fees are separate`
  - Pricing subtitle now states plans do not include setup or monitoring fees
  - Managed service pricing available on request when purchasing
  - Updated EN, RU, ZH translations
- `fix: update FAQ answer to mention Managed Service in provisioning`
  - Added "With Managed Service, " to the start of the provisioning FAQ answer

- `chore: hide efficiency section pending team review` (commit `b8a1156`)
  - EfficiencySection temporarily removed from landing page

### Fixed

- `fix: sync efficiency section prices with updated GPU pricing` (commit `d5c65e6`)
- `fix: update GPU pricing and clarify managed service as optional` (commit `c89f47b`)
- `fix: aggregate all GPU variants for efficiency calculation` (commit `94d40f2`)
