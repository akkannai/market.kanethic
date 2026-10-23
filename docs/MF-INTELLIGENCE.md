# Kanethic Mutual Fund Intelligence — Phase 1 (NAV Explorer + Category view)

Real data only: AMFI `NAVAll.txt` (daily NAV, all schemes) + mfapi.in (history). Pages read **only from MySQL**; cron jobs fetch in the background.

## 1. Plan check (Hostinger)

| Need | Status |
|---|---|
| Node.js | Tamara server par Node **v20.20.2** chale che (`/api/diag` ma dekhay) — OK. Code Node 20 par chale che. |
| MySQL | hPanel → Databases → MySQL ma DB banavo. Hostinger Node app mate `DB_HOST` saamanya rite `localhost` (na chale to `127.0.0.1` ke hPanel ma batavelu host). **Aa haju tamara server par test nathi thayu.** |
| Cron | hPanel → Advanced → **Cron Jobs**. Cron fakat `curl` chalave che, Node job app ni andar chale che — website khole vagar chale. |
| Jo cron na hoy | Sauthi saste fix: free external scheduler (cron-job.org) je niche na URL ne roj call kare. Nahi to Hostinger VPS (cron + Node bannee maate). Stack badalvani jarur nathi. |

## 2. Database (auto-created on first request)

`schemes` (code PK, ISIN, AMC, category, plan, option) · `nav_history` (code+date PK, NAV, source) · `nav_latest` (1D change, previous date, 1M…5Y returns) ·
`category_summary` · `job_runs` · `job_locks` · `data_status` (source / data-as-of / last checked / last error) · `nav_review` (NAV > ±20%) · `backfill_state`.
Dara scheme = alag AMFI scheme code; Direct/Regular ane Growth/IDCW kadi mix thatu nathi.

## 3. Cron jobs (Asia/Kolkata)

Hostinger cron kyarek server time (UTC) vapre che. hPanel ma timezone jovo; jo UTC hoy to aa UTC lines vapro (IST − 5:30):

| IST | UTC | Job |
|---|---|---|
| 23:00 | 17:30 | nav-fetch |
| 23:45 | 18:15 | nav-fetch (retry) |
| 07:00 | 01:30 | nav-fetch (retry) |
| 10:00 | 04:30 | nav-fetch (last retry) |
| every 30 min (until done) | — | backfill |
| (manual, jarur pade tyare) | — | recompute ("Rebuild latest" in /admin) |

```
30 17 * * *  curl -fsS -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" "https://market.kanethic.com/api/cron/nav-fetch?slot=23:00&wait=1"
15 18 * * *  curl -fsS -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" "https://market.kanethic.com/api/cron/nav-fetch?slot=23:45&wait=1"
30 1  * * *  curl -fsS -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" "https://market.kanethic.com/api/cron/nav-fetch?slot=07:00&wait=1"
30 4  * * *  curl -fsS -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" "https://market.kanethic.com/api/cron/nav-fetch?slot=10:00&wait=1"
*/30 * * * * curl -fsS -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" "https://market.kanethic.com/api/cron/backfill"
```

Retry logic: `expected NAV date` IST ma gani ne (22:00 pachhi aaj ni, nahi to gai kal ni, weekend → Friday). Retry slots par jo DB ma e date aavi gai hoy to job `skipped`. 10:00 par pan navi NAV na hoy to `nochange` (holiday / AMFI delay) — failure nathi. Fail thay to email aave.
Backfill: batch ma chale, resumable; badhi scheme thai jaay pachhi `nothing left` aape. Pehla divas ma Regular Growth schemes pehla aave (priority).

## 4. Rules implemented

- **NAV change > ±20%** vs previous available NAV → publish thatu nathi; `/admin` ma review queue (Approve / Reject).
- **Failed fetch** → junu data rahe che, `data_status.last_error` set; pages par **"Stale"** badge. Email → `ALERT_EMAIL` (3 kalak ma ek j).
- **1D change** = latest NAV vs previous *available* NAV of same scheme code; banne dates dekhay (weekend/holiday safe).
- **Returns**: 1M/3M/6M/1Y absolute, 3Y/5Y CAGR — fakat jyaare e date no NAV history (≤7 din nu gap) hoy.
- **Category summary**: Regular + Growth only, same NAV date only; "calculated summary".
- Dara section: Source · Data as of · Last checked. Footer disclaimers + ARN-254247 + CTA "Talk to Kanethic" (WhatsApp 9998170093; `NEXT_PUBLIC_WHATSAPP` thi badlay).

## 5. Deploy steps

1. hPanel → Databases → MySQL: database + user banavo. Details `.env`/Environment variables ma (`DB_*`).
2. `CRON_SECRET` = `openssl rand -hex 24`. `SESSION_SECRET` pan random 32+.
3. Admin password hash: `node scripts/hash-password.mjs 'lambo-password'` → `ADMIN_PASSWORD_HASH` ma. `ADMIN_USER` set karo.
4. SMTP: Hostinger Email ma mailbox (jem noreply@kanethic.com) → `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
5. Node.js Web App deploy (`npm install`, `npm run build`, `npm start`).
6. **Pehli vaar:** `/admin` login → *Run now* "nav-fetch" (AMFI thi ~14k schemes load) → pachhi "backfill" (cron pan kare). Progress `/admin` ma %.
7. hPanel → Cron Jobs ma upar ni 5 lines nakho (YOUR_CRON_SECRET badli ne).
8. Check: `/admin` → Send test email; `/mutual-funds` ma "Data as of" taaji NAV date.

## 6. Tests

`npm test` — pure calculations/parsers (DB vagar). `npm run test:db` — real MySQL/MariaDB par integration (`DB_TEST_HOST`, `DB_TEST_PORT`, `DB_TEST_USER`, `DB_TEST_PASSWORD`, `DB_TEST_NAME`): Friday→Monday gap, ±20% review, failed fetch keeps data, backfill resumable, job lock, failure email (in-process SMTP).

## 7. Verified vs not verified

Verified (offline, fixtures + real MariaDB): parsing, 1D/returns maths, weekend gap, 20% guard, stale behaviour, backfill, lock, email, admin auth, all pages/API.
**Not verified from our build sandbox** (hosts blocked): live AMFI / mfapi responses, Hostinger MySQL host, Hostinger cron timezone, SMTP login. Pehla run par `/admin` ma Job status jovo; error aave to message dekhase.
