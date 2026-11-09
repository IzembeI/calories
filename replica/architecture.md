# Architecture: Калории (a rebuild of YAZIO's core tracking features)

## Stack

| layer | choice | why |
| --- | --- | --- |
| app | Expo SDK 58 (React Native) + TypeScript, expo-router | the only iPhone stack that can be developed on Windows: live preview in Expo Go on the phone, native build in the cloud |
| database | SQLite on device (expo-sqlite), hand-written migrations | user chose device-only storage; no server, no account |
| state | small React context + SQL queries per screen | 7 tables, no need for a state library |
| food data | built-in JSON of basic foods (Russian) + Open Food Facts public API + user foods | OFF is free, no key, has barcodes; built-in list covers generic foods OFF lacks |
| barcode | expo-camera (`CameraView` barcode scanning, EAN-13/8, UPC) | official Expo module |
| PDF | expo-print (HTML → PDF via iOS WebKit) + expo-sharing | WebKit renders system fonts, so Cyrillic just works; tables and SVG charts via HTML |
| charts | react-native-svg, hand-drawn line/bar charts | two chart types; avoids a heavy chart lib |
| notifications | expo-notifications (local only) | meal reminders, no push server |
| backup | expo-file-system + expo-document-picker + expo-sharing (JSON) | device-only data needs a way out |
| build | GitHub Actions `macos` runner: `expo prebuild` → `pod install` → `xcodebuild` with signing off → package `Payload/*.app` → fakesign with `ldid` → `.ipa` artifact | no Mac needed; TrollStore installs a fakesigned IPA permanently |
| auth / payments / email / jobs / hosting | none | personal offline app |

## Schema

Tables: 7 (+ `meta` for the schema version). Access rules: none needed — one user, one device.
SQLite, so: ids are text UUIDs, dates are `YYYY-MM-DD` text in the **device's local
time zone** (a diary day is a local day), timestamps are ISO-8601 UTC text,
nutrients are REAL per 100 g. See `replica/schema.sql`.

## API (internal data layer, `src/db/*.ts` — no network routes)

| function | does | flow |
| --- | --- | --- |
| `getProfile / saveProfile` | profile + goals; recompute kcal goal | F01, S18 |
| `searchFoods(q)` | local LIKE search over builtin + custom foods, ranked by last_used | F02 |
| `offSearch(q)` / `offByBarcode(code)` | Open Food Facts `GET /cgi/search.pl` and `GET /api/v2/product/{code}`; result cached into `foods` (source=off) when logged | F02, F03 |
| `addEntry / updateEntry / deleteEntry` | diary entries with nutrient snapshot | F02-F04 |
| `getDay(date)` | entries + water + activities + measurements + totals | S04 |
| `copyMeal(fromDate, meal, toDate)` | copy entries | should |
| `upsertMeasurement / deleteMeasurement / series(type, from, to)` | body values | F07, F08 |
| `addWater`, `addActivity` | | F06 |
| `buildDiaryPdf(range, opts)` / `buildMeasurementsPdf(range, opts)` | HTML → `Print.printToFileAsync` → share | F09 |
| `exportBackup / importBackup` | all tables ↔ JSON | F10 |

External: Open Food Facts only, with a `User-Agent: Kalorii/1.0 (personal app)` header as OFF asks. Read-only.
Webhooks: none. Jobs: local notifications scheduled on the device.

## The parts that bite

- **time zones**: diary dates are local calendar days stored as text; never derive a day from a UTC timestamp.
- **food history**: entries keep a snapshot of kcal/macros per 100 g, so editing or deleting a food never changes past days.
- **OFF data quality**: many products lack some nutrients or have kJ only → convert kJ/4.184, treat missing as null not 0, show "нет данных".
- **OFF rate limits**: search ~10 req/min per IP → debounce 500 ms, search OFF only on explicit submit / after local results, cache.
- **offline**: everything but OFF works offline; OFF errors show a quiet "нет сети" row.
- **PDF size**: a year of diary is hundreds of pages → option "только итоги по дням" for long ranges.
- **migrations**: `meta.schema_version`, run in order on startup inside a transaction; never edit a shipped migration.
- **backup**: device-only data is lost with the app; reinstall over TrollStore keeps data, deleting the app does not → backup reminder in settings.
- **unsigned build**: Expo modules that need entitlements (notifications) still work under TrollStore fakesign; give `ldid` an entitlements file.

## Build order

1. **Vertical slice**: S04 diary for today, S06 search over built-in foods, S08 add with grams, totals on the ring. Tables: profile, foods, diary_entries. Plus the CI workflow producing an IPA — proves the hardest part (no Mac) early.
2. **Must-haves**: S01-S03 onboarding + goal math; S05 date picker; S07 barcode + OFF; S09 edit/delete; S10 custom food; S13 water; S15 measurements; S16-S17 charts; S18 goals; S19 PDF export (diary + measurements).
3. **Should-haves**: favourites, custom meals (S11), quick add (S12), copy meal, activities (S14), kcal bar chart, nutrient averages, backup/restore, reminders, dark mode.
4. **Could-haves**: charts in PDF, water reminders, progress photos, Nutri-Score.
5. Fixes from replica-entrepreneur (if run).
