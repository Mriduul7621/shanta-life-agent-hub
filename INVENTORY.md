# Agent Hub — Tool Inventory

Verified 2026-11-20 by the Hub coordinator (GitHub connector + Vercel connector + memory).
Production URLs are the canonical first alias of each project's latest READY production
deployment. Do not guess URLs — if a URL is not listed here, it is not verified.

## The 6 Hub tools

| # | Tool | GitHub repo | Stack | Vercel project | Production URL |
|---|---|---|---|---|---|
| 1 | Learning Hub (LMS) | Mriduul7621/shanta-life-learning-hub (TS, private) | React 19 + Vite 7 + Tailwind 4, PWA/Capacitor, Supabase | shanta-life-learning-hub | https://shanta-life-learning-hub.vercel.app |
| 2 | LeadFlow | Mriduul7621/LeadFlow_V2 (TS, public) | React + Vite + Express + Supabase (Postgres), JWT auth | lead-flow | https://lead-flow-jet.vercel.app |
| 3 | PremiumPulse (Premium-illustrator) | Mriduul7621/Premium-illustrator (TS, public) | TypeScript + Vite, static | premium-illustrator | https://premium-illustrator.vercel.app |
| 4 | SDPP Value Projection | Mriduul7621/SDPP-Value-Projection (TS, private) | TypeScript + Vite, static | sdpp-value-projection | https://sdpp-value-projection.vercel.app |
| 5 | Income Calculator | Mriduul7621/Shanta-Life-Income-Calculator (TS, private) | React 19 + Vite 6 + Tailwind 4, AI Studio origin | income_calculator | https://incomecalculator-delta.vercel.app |
| 6 | Retail Sales Dashboard | Mriduul7621/Retail_Dashboard (TS, private) | Vite app (dist build in repo), Google Sheets data | retail-dashboard | https://retail-dashboard-zeta.vercel.app |

## Notes

- **Shared identity (SSO basis):** Learning Hub and LeadFlow both key users by the same
  Employee ID, from one HR roster. Separate Supabase projects (500 MB each).
- **PremiumPulse second deployment:** https://premiumpulsevr2.vercel.app is Vercel project
  `premiumpulse_vr_2` under Mahadi's mriduul.tnd@gmail.com account (same repo, same code).
  The Hub links the main deployment (premium-illustrator.vercel.app).
- **Sales Command Center (NOT a tile, NOT a data source):** the Hub's
  Dashboard page used to read the SCC's public sheet (Milestone 3), but
  Mahadi corrected it on 2026-11-20 — the Hub's dashboard tool is the
  Retail Sales Dashboard, and the in-Hub Dashboard page now reads retail
  data via the Hub-side proxy (`api/retail-data.js`). The SCC is no longer
  a source anywhere in the Hub. The SCC repo is
  Mriduul7621/Training-Dashboard_Shanta-Life (TS, private; package
  `shanta-analytics`, page title "Shanta Training & Sales Analytics";
  React 19 + Vite 6 + recharts + xlsx, AI Studio origin, Gemini; Vercel
  project `training-dashboard-shanta-life`, second project
  `shantalifedashboard_tnd` deploys the same repo;
  https://training-dashboard-shanta-life.vercel.app). Do not rename anything
  in that repo, and do not re-add the tile or the sheet without Mahadi's word.
- **Official agent portal (IT-owned, NOT a Hub module):** proposal submission, e-KYC,
  claims stay here. The Hub links to it only. Production portal URL to be confirmed
  with IT — see `~/workspace/your_files/shanta-life-agent-portal-training/Exploration_Report_2026-11-07.md`
  for the UAT exploration (test agent NIHAN ARFIN, RO, code 1101010127001 — read-only).
- **Retail Dashboard (Hub module #6 + Dashboard page data source):**
  Mriduul7621/Retail_Dashboard, https://retail-dashboard-zeta.vercel.app/ — already
  reads the Due & Lapse sheet. Reuse its mapping; do not invent one. Its live page
  title is still "Shanta Life Sales Command Center" (the app's own title) — the
  Hub tile is named "Retail Sales Dashboard" per Mahadi's decision. The Hub's
  Dashboard page reads its live endpoint (`/api/sales-data`) through the
  Hub-side proxy (`api/retail-data.js`), which returns only the scoped
  summary — see `~/workspace/agent-hub-retail-spec/RETAIL_DASHBOARD_SPEC.md`.

## Tax Rebate Calculator — REMOVED (Mahadi's decision, 2026-11-20)

The Tax Rebate Calculator is NOT part of the Hub. It was searched for during the
Milestone 1 inventory (all 41 Mriduul7621 GitHub repos, all 20 Vercel projects in
the mriduul7621s-projects team, memory, portfolio, web search) and no repo or live
URL was found; Mahadi then decided to drop it from the Hub entirely. Do not
re-add it without his word.
