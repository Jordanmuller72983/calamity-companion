# Calamity Companion

A mobile and laptop app for Mauritius that turns official cyclone and rain warnings into plain-language actions
("Class II: schools closed, buses still running"). It shows the cyclone track, reservoir levels and community
reports on a map, and gathers every page of the Mauritius Meteorological Services (MMS) website in one place.
Everything is read live from official sites. Personal project and case study in designing for stress and urgency.

## Run it

```bash
npm run dev        # from the project root or from app/; open http://localhost:5173
npm test           # 51 tests, most against real saved MMS pages
```

Phones on the same Wi-Fi can open the "Network" address Vite prints.

## Deploy (Vercel)

The app is a separate Vercel project, so it doesn't affect other projects on the same account.

```bash
cd app
npx vercel login        # once, opens the browser
npm run deploy          # bundles the API (api/index.mjs) and deploys to production
```

- **First deploy:** answer "Link to existing project?" with **No**, name it `calamity-companion` and keep the directory `./`.
- **Reports storage:** in the Vercel dashboard, open the project → **Storage** → **Upstash for Redis** → connect it, then run `npm run deploy` again. Without it, the app works but sending reports fails.
- **How it runs:**
  - The site is static (`dist/`). All `/api/*` routes go to one function ([server/vercel.ts](app/server/vercel.ts) → `api/index.mjs`, region Cape Town).
  - Responses are cached at Vercel's edge (2–60 min depending on the route), so MMS, CWA and the press aren't hit on every visit.

Useful links:

- `?mode=belal`: the real MMS bulletin and GDACS track from Cyclone Belal (16 Jan 2024)
- `?mode=c3` (or `c1`, `c2`, `c2rain`, `c4`, `watch`, `trw`, `lifted-rain`, `after`, `stale`, `clear`): demo warnings
- `?tab=map`, `?tab=mms&page=satellite-imagery.php`, `?tab=report`

## What's in it

| Screen | What it does |
|---|---|
| **Now** | Current warning in plain words, school / work / buses / going out, "do now" steps, rain & wind strip (auto-scrolls through places), storm position card, rainfall by station, reservoirs, CWA notices, weather, the official bulletin text |
| **Map** | Mauritius map: cyclone position and heading (MMS), past and forecast track, uncertainty cone, wind zones (GDACS); the 12 main reservoirs with their latest level; community reports |
| **Report** | **Appears automatically during a cyclone warning** (Class I–IV and the safety bulletin that follows). Flooded road, fallen tree, power line down, landslide, no water, road blocked. Location from GPS or a tap on the map, optional photo |
| **MMS** | Every section of the MMS website (Weather, Cyclone, Torrential Rain, High Waves, Tsunami, Climate Services, Sun Moon & Tides, Satellite & Chart), read live, including the satellite image and animation, synoptic chart, weather map, 7-day forecast, tides, and cyclone bulletins in English / French / Kreol |

Languages: English, French, Kreol Morisien. Layout: phone (bottom tabs), tablet, laptop (sidebar).

## Live data sources

| Data | Source | How |
|---|---|---|
| Warnings, bulletins, rainfall, wind, temperature, forecasts, all MMS pages | metservice.intnet.mu | HTML read every 5 min (MMS has no data feed). The menu itself is read live, so new MMS pages appear automatically |
| Cyclone position, intensity, heading | MMS cyclone bulletin text | Parsed: "centred … near latitude 21.5 S and longitude 57.5 E … moving in a general easterly direction at 15 km/h" |
| Cyclone track, forecast, cone, wind zones | GDACS (republishes RSMC La Réunion) | GeoJSON API, South-West Indian Ocean storms only |
| Reservoir locations and capacities | CWA ArcGIS service (gis.cwa.mu) | Live, with built-in fallback |
| Reservoir levels | CWA / Water Resources Commission communiqué PDFs | Text extracted from the PDFs linked in CWA posts. Published press figures fill gaps; the newest figure wins |
| CWA notices (water cuts, schedules) | cwa.govmu.org | WordPress REST API |
| Press headlines | Defimedia RSS; L'Express via Google News RSS (lexpress.mu blocks automated requests) | Weather/warning headlines only, shown next to the guidance. They never change the rules |
| Current weather in 13 more towns | Open-Meteo (free, keyless weather-model API) | Every 15 min. Labelled "estimates", kept separate from MMS measurements |
| Disruptions not caused by weather (Metro, buses, schools, curfew) | Same press feeds, last 3 days | Each headline is classified by service and state (see [server/disruptions.ts](app/server/disruptions.ts)). Tiles show "Press report, not official" with the headline, source and age |
| Metro Express and CWA updates | Their official Facebook pages (linked from mauritiusmetroexpress.mu and cwa.govmu.org) | Facebook's own Page Plugin, loaded only on tap (it sets cookies). We don't scrape Facebook |
| Community reports | This app | Stored in `app/server/data/` for now (gitignored) and shown on the map |

## Reports to the authorities

After someone sends a report, the app lists the bodies responsible for that kind of problem (from
[app/src/data/authorities.json](app/src/data/authorities.json), e.g. power lines → CEB, water → CWA, flooding → NDRRMC,
Land Drainage Authority, RDA), each with:

- **Email:** opens the person's own email app with **To** set to the authority and the report written in French and English (place, map links, time, details). They check it, add a photo if they want, and press Send. The **From** is their own address. The app sends nothing itself.
- **Call / WhatsApp:** the authority's hotline (e.g. CEB 130, CWA 170). None of these bodies says it handles incidents by email, so the phone is the urgent channel.

## How the warning logic works

- Cyclone and rain warnings are **two separate signals**, both always visible.
- Each topic takes the most restrictive status across active warnings. On a severity tie, rain wins ("do not travel" beats "get home").
- When a cyclone warning is lowered while a rain warning stays on, a strong "not safe yet" alert appears.
- Data older than 30 minutes is flagged. The app never shows "no warning" before it actually knows.

All rules are in [app/src/rules/warning-rules.json](app/src/rules/warning-rules.json), using the official MMS terms
(Class I–IV, Safety Bulletin, Termination; Heavy Rain Watch / Warning, Torrential Rain Warning). They were checked on
16 Oct 2026 against:

- **Official texts:** the MMS Warnings Regulations 2023, the Workers' Rights Act 2019 s.32, the January 2025 public-sector protocol, the ECCEA pre-primary protocol, and the Cabinet decision of 22 May 2026.
- **Press reports of past events:** Defimedia, Le Mauricien, and L'Express via AllAfrica.

Each tile shows what it rests on:

- **Law:** Workers' Rights Act or MMS regulations.
- **Ministry decides each time:** schools close by communiqué, not by law.
- **Based on past events:** e.g. buses ran 3 more hours after Class III in 2019, and restart about 2 hours after the safety bulletin.
- **Not confirmed:** no evidence found (buses under Class II and under heavy rain).

Tests enforce that every claim has a source.

Key facts the rules now reflect:

- Under Class III, Class IV and the safety bulletin, workers may stay off work and are paid (s.32(4)). An employer who needs staff on site pays 3× the hourly rate and a free meal (s.32(6)).
- Class II gives no right to stay off work.
- Under torrential rain, work protection applies only if the National Crisis Committee orders people indoors. The May 2026 protocol that would change this is approved but not yet law.

## Before release

- [x] Check the rules against official texts and press reports (16 Oct 2026). Still unconfirmed: buses under Class II and under heavy rain
- [ ] Update the torrential rain work rule when the May 2026 protocol becomes law
- [ ] Ask the authorities which email address they want community reports sent to
- [ ] Native-speaker review of the French and Kreol texts
- [ ] Confirm the emergency numbers (999 police, 114 SAMU, 115 fire)
- [ ] Ask MMS and CWA about an official data feed, and about reuse of their content
- [ ] Moderation for community reports before going public
- [ ] Move the `/api` routes and report storage to Supabase; Capacitor builds for Android / iOS
