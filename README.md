# Kanethic Market Hub (v1.0)

Near-live Indian + global markets, currencies, commodities, news ane economic calendar.
**Koi API key, database ke scheduler jaruri nathi** — server pote free public feeds mathi data lai, 20–120 sec cache kare che;
browser dar 30 sec e refresh kare che (tab dekhato hoy tyare j).

## Hostinger par chalavvu (Node.js Web App)

1. hPanel → Websites → Add Website → **Node.js Web App** → ZIP / GitHub repo upload.
2. Node **20.9+** (24.x best). Install: `npm install`, Build: `npm run build`, Start: `npm start`.
3. Environment variables (optional): `.env.example` jovo.
4. Deploy pachhi `/sources` page par feed health joi lo; `/api/health` pan che.

Local: `npm install && npm run build && npm start` (http://localhost:3000).
Offline UI test (fake data, sirf dev): `npm run dev:mock`.

## Instrument add / remove

`lib/instruments.ts` ma ek line umero / kadho. `symbol` = Yahoo Finance symbol.
Top gainers/losers ni list `lib/nifty50.ts` ma che.

## Data sources ane accuracy

| Data | Source | Note |
|---|---|---|
| Indices, FX, futures, yield | Yahoo Finance public chart endpoints | Near-live; kyarek 15–20 min delay. Unofficial endpoint |
| Indian gold/silver | COMEX × USD/INR × (1 + duty%) | Indicative; GST/making vagar. `INDIA_BULLION_PREMIUM_PCT` |
| News | ET, Moneycontrol, Mint, Business Standard, RBI, Fed RSS | Sirf headline + link |
| Calendar | Faireconomy weekly JSON | Global events; Indian releases nathi |

Har quote ma "as of" time ane Near-live / Last close badge che. Upstream fail thay to last good value apvama ave che
(header ma "Delayed" dekhay), kadi banavti value nahi.
Public / commercial site mate Yahoo na terms check karo; data layer `lib/yahoo.ts` ma alag che — licensed feed ma sahelai thi badli shakay.

Tests: `npm test` · Typecheck: `npm run typecheck`

Kanethic Private Limited • Invest With Discipline. • AMFI-registered Mutual Fund Distributor | ARN-254247.
