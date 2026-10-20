# Kanethic Market Hub (v1.1)

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

## Features (v1.1)

- **English / ગુજરાતી** toggle (header ma EN | ગુ). Navu text: `t('English')` vapro ane `lib/i18n.ts` ma Gujarati umero; translation na hoy to English dekhay.
- **Mutual funds** (default sirf **Regular** plans; `MF_PLAN=direct|any` thi badlay; AMFI na male to `mfapi.in` fallback; error nu kaaran page par ane `/sources` ma dekhay): AMFI `NAVAll.txt` (official) mathi search + latest NAV; fund page par NAV chart ane trailing returns
  (NAV history `mfapi.in` thi; 1M/6M absolute, 1Y+ CAGR — pote ganela, dividend/IDCW ane tax shamil nathi).
- **Calculators**: SIP (step-up sathe), Lumpsum, Goal (jaruri monthly SIP). Illustration only.
- **Price alerts**: browser ma save thay (localStorage) ane site khuli hoy tyare j tapase (dar 30 sec). Browser notification + in-page toast.
  Site band hoy tyare SMS/email/WhatsApp alert mate server, database ane user contact joiye — haju nathi.
- **Talk to us** button: `.env` ma `NEXT_PUBLIC_WHATSAPP` ke `NEXT_PUBLIC_CONTACT_URL` set karo (build pehla). "Advisor" shabd jaan-bujhine vaparyo nathi (MFD/ARN mate).

## Instrument add / remove

`lib/instruments.ts` ma ek line umero / kadho. `symbol` = Yahoo Finance symbol.
Top gainers/losers ni list `lib/nifty50.ts` ma che.

## Data sources ane accuracy

| Data | Source | Note |
|---|---|---|
| Indices, FX, futures, yield | Yahoo Finance public chart endpoints | Near-live; kyarek 15–20 min delay. Unofficial endpoint |
| Indian indices (primary/backup) | NSE India official API (`/api/allIndices`) | Cookie-wala session; Nifty 50 movers pan NSE thi aave jo Yahoo na chale |
| Global indices + commodities + US 10Y (backup) | CNBC quote service | Free, key vagar; sparkline nathi |
| All instruments (backup) | Yahoo batch quote (cookie + crumb) | Yahoo chart 429 aape tyare |
| Global indices (fallback) | Stooq daily CSV | Yahoo na aape tyare: S&P 500, Dow, FTSE, DAX, CAC, Nikkei, Hang Seng, Shanghai, KOSPI, STI (Nasdaq Composite ane ASX 200 nu fallback nathi); daily close |
| Currencies (fallback) | ECB via Frankfurter (api.frankfurter.dev) | Yahoo na aape tyare; daily reference rate, "Last close" tarike dekhay; AED = USD peg 3.6725 |
| Indian gold/silver | COMEX × USD/INR × (1 + duty%) | Indicative; GST/making vagar. `INDIA_BULLION_PREMIUM_PCT` |
| Mutual fund NAV | AMFI NAVAll.txt (+ mfapi.in history) | Daily NAV, bazar band thaya pachhi; live nathi |
| News | ET, Moneycontrol, Mint, Business Standard, RBI, Fed RSS | Sirf headline + link |
| Calendar | Faireconomy weekly JSON | Global events; Indian releases nathi |

Har quote ma "as of" time ane Near-live / Last close badge che. Upstream fail thay to last good value apvama ave che
(header ma "Delayed" dekhay), kadi banavti value nahi.
Public / commercial site mate Yahoo na terms check karo; data layer `lib/yahoo.ts` ma alag che — licensed feed ma sahelai thi badli shakay.

Priority: NSE > Yahoo chart > Yahoo batch > CNBC > Stooq/ECB. Yahoo 429 aape to 5 min cooldown. Source dara quote par lakhelo che.

Diagnosis: `/api/diag` kholo — server thi dara data host nu test kari (HTTP status / error) batave.

Tests: `npm test` · Typecheck: `npm run typecheck`

Kanethic Private Limited • Invest With Discipline. • AMFI-registered Mutual Fund Distributor | ARN-254247.
