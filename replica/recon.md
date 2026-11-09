# Recon map: YAZIO (iOS)

Scope: the calorie-tracking core — food diary with goals and macros, food search /
barcode / custom foods and meals, water, activities, weight and body measurements,
progress charts. **Changes vs original:** no intermittent fasting at all; new PDF
export of the food diary and of body measurements. No recipes catalogue, no PRO
paywall, no rewards, no ads.
For: the user's personal use on their own iPhone (unsigned IPA via TrollStore).
Russian UI. All data stays on the device.
Date: 2026-11-09

Working name: **Калории** (placeholder; nothing of YAZIO's name, logo, copy,
illustrations or colours ships — see /replica-brand).

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | App Store listing | https://apps.apple.com/us/app/yazio-calorie-counter-diet/id946099227 | free vs PRO feature list, reviews |
| 2 | Help: app tutorial | https://help.yazio.com/hc/en-us/articles/11804776635281-Tutorial-of-the-YAZIO-app | text pasted by the user (site 403s bots). Tabs: Diary, Recipes, Fasting, Analysis, Profile, Settings. Diary = consumed / remaining / burned + macros, meals, activities, water, weight. Own recipes can be created. Analysis by day (free) / week / month (PRO) — clone gives all ranges. |
| 3 | Help: body measurements | https://help.yazio.com/hc/en-us/articles/360002401337-How-do-I-add-body-measurements-to-track-my-progress | text pasted by the user. Diary → "Measurements" section → +/- for weight; "More → Add more" → pick type → value → Save. Advises weekly, same day and conditions → clone adds an optional weekly reminder. |
| 4 | Open Food Facts API | https://openfoodfacts.github.io/openfoodfacts-server/api/ | food DB for the clone (public, free) |

Not used: the user's account (none offered), any app binary or network traffic.

## Core loop

Open today's diary, add what you ate to a meal in a few taps (search, recent or
barcode), and see calories and macros left for the day against your goal.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Onboarding: goal | first launch | lose / maintain / gain | option cards, progress bar | — |
| S02 | Onboarding: body data | after S01 | sex, birth date, height, weight, target weight, activity level, weekly pace | number pickers, segmented control | validation error |
| S03 | Onboarding: plan result | after S02 | daily kcal + macro split, start | summary card, primary button | — |
| S04 | Diary (home tab) | tab 1 | today's summary + meals + water + activities + measurements | week date strip, kcal ring (eaten / left / burned), macro bars, meal cards, water glasses, measurement card | empty day, filled, over goal, past/future date |
| S05 | Date picker | tap date in S04 | jump to any day | calendar month view | — |
| S06 | Add food | "+" on a meal card | find a food | search field, tabs: recent / favourites / my foods / my meals, barcode button, quick-add | empty search, loading, no results, offline |
| S07 | Barcode scanner | barcode button in S06 | scan a product | camera view, torch toggle | permission denied, not found → create food |
| S08 | Food detail | tap a result | choose amount and serving, add to meal | serving picker, amount input, nutrient table, meal selector, favourite toggle | — |
| S09 | Meal entries | tap a meal card in S04 | see / edit / delete entries of a meal | list rows with swipe actions, totals | empty |
| S10 | Create / edit food | "my foods" → +, or after barcode miss | custom product per 100 g + servings | form fields, barcode field | validation |
| S11 | Create / edit meal | "my meals" → + | a reusable combination of foods | food list, add food, totals | empty |
| S12 | Quick add | S06 | log raw kcal (+ optional macros) without a food | number inputs | — |
| S13 | Water | water card in S04 | log glasses / ml, daily goal | glass grid, +/- | goal reached |
| S14 | Activity | activities card in S04 | log activity with burned kcal | activity list (built-in MET list), duration, kcal | empty |
| S15 | Measurements | measurements card in S04 | log weight and body values for the date | rows: weight, body fat %, neck, chest, biceps L/R, waist, belly, hips/glutes, thigh L/R, calf; +/- and direct input | first entry, filled |
| S16 | Analysis / progress | tab 2 | charts over week / month / year | segmented range, line chart (weight, any measurement), bar chart (kcal vs goal), macro averages | no data |
| S17 | Measurement history | tap a series in S16 | list of every value of one series, edit / delete | list, chart | empty |
| S18 | Profile / goals | tab 3 | edit body data, kcal goal, macro split, water goal, units | list cells, pickers | — |
| S19 | Export PDF (new) | profile tab or share button in S16 | pick period + what to include, build PDF, share | date range, toggles (diary, nutrients summary, measurements, charts), share sheet | generating, empty period |
| S20 | Settings | profile tab | reminders, meal names, backup / restore JSON, about | toggles, time pickers | — |

## Flows

```
F01 First launch to a plan
    S01 -> S02 -> S03 -> S04
    happy path taps: ~10
    edge: unrealistic target (BMI < 18.5), very fast pace, imperial units

F02 Log a food by search (core loop)
    S04 -> S06 (type) -> S08 (amount) -> back to S04
    happy path taps: 4 + typing
    edge: offline (OFF unreachable) -> built-in + my foods still searchable; product without kcal data

F03 Log a food by barcode
    S04 -> S06 -> S07 -> S08 -> S04
    happy path taps: 4
    edge: camera denied, barcode not in OFF -> S10 prefilled with barcode

F04 Log again from recent
    S04 -> S06 (recent tab) -> tap "+" on row -> S04
    happy path taps: 3

F05 Create own food / meal
    S06 -> S10 or S11 -> save -> S08

F06 Log water
    S04 -> tap glass in S13 card
    happy path taps: 1

F07 Log weight and measurements
    S04 -> S15 -> enter values -> save
    happy path taps: 2 + typing
    edge: editing an older date, removing a value

F08 See progress
    tab S16 -> pick range -> pick series -> S17

F09 Export PDF (new)
    S18/S16 -> S19 -> choose range + sections -> generate -> share sheet (Files, Telegram, AirDrop)
    happy path taps: 4
    edge: no entries in range, long range (hundreds of pages) -> daily summary mode

F10 Backup / restore
    S20 -> export JSON to Files / import JSON
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Tab bar | 3 tabs (Дневник, Прогресс, Профиль) | active | all |
| Week date strip | — | today, selected, has data | S04 |
| Calorie ring | — | under, at, over goal | S04 |
| Macro bar | protein, fat, carbs | under, over | S04, S09 |
| Meal card | breakfast, lunch, dinner, snack | empty, filled | S04 |
| Food row | search result, diary entry | default, swiped (delete/edit) | S06, S09, S11 |
| Search field | with barcode button | empty, typing, loading | S06 |
| Number stepper | +/- with direct input | default, disabled | S13, S15 |
| Serving picker | grams, piece, portion, ml | — | S08 |
| Nutrient table | compact, full | — | S08, S10 |
| Line chart / bar chart | weight, measurement, kcal | empty, filled | S16, S17 |
| Primary / secondary button | — | default, disabled, loading | all |
| Bottom sheet | — | — | S08, S12 |
| Empty state | per screen | — | S06, S09, S16, S17 |
| Toast | success, error | — | all |

## Inferred data model

```
Profile        sex, birth_date, height_cm, start_weight_kg, target_weight_kg,
               activity_level, goal (lose|maintain|gain), pace_kg_per_week,
               kcal_goal, protein_pct, fat_pct, carbs_pct, water_goal_ml, units
               evidence: S01-S03, S18   confidence: high

Food           id, source (builtin|off|custom), barcode?, name, brand?,
               kcal_100, protein_100, fat_100, carbs_100, sugar_100?, fiber_100?,
               salt_100?, servings [{name, grams}], favourite, last_used_at
               evidence: S08, S10, OFF API fields   confidence: high

Meal (recipe)  id, name, items [{food_id, grams}]
               evidence: S11, listing "custom meals"   confidence: medium

DiaryEntry     id, date, meal_type (breakfast|lunch|dinner|snack), food_id | meal_id
               | quick (kcal, p, f, c), grams, snapshot of nutrients
               evidence: S04, S09   confidence: high
               (snapshot so editing a food later doesn't rewrite history — a guess, but the safe choice)

WaterEntry     date, ml                      evidence: S13   confidence: high
ActivityEntry  date, name, minutes, kcal     evidence: S14   confidence: medium

Measurement    id, date, type (weight|body_fat|neck|chest|biceps_l|biceps_r|waist|
               belly|hips|thigh_l|thigh_r|calf_l|calf_r|forearm), value, unit
               evidence: help article "body measurements" (weight + "add more")
               confidence: high for weight, medium for the exact list
```

Relationships: DiaryEntry n-1 Food or Meal; Meal 1-n items -> Food; one Profile.

## Feature matrix

See `features.csv`. Must: 22, should: 12, could: 6, skip: 10.

## Out of scope (cannot or should not be cloned)

- Intermittent fasting (user request: removed).
- YAZIO's food database (4M+ items) and its 2,900 recipes — owned content; replaced by Open Food Facts + a built-in list of basic foods + user foods.
- PRO subscription, paywall, ads, rewards (chests / diamonds).
- AI photo food recognition — needs a paid vision service; could be a later add-on.
- Fitbit / Garmin sync — partner integrations.
- Apple Health sync — possible later (HealthKit entitlement works with TrollStore), not in v1.
- Apple Watch app, widgets, Siri shortcuts — later.
- Account, cloud sync, multi-device (user chose device-only storage).
- YAZIO name, logo, illustrations, colours and text.

## Size

Screens 20, flows 10, entities 7. Hard parts:
1. Food search quality: Open Food Facts is strong on packaged goods with barcodes,
   weak on generic Russian food names → the built-in basic foods list carries plain search.
2. PDF export on device: multi-page tables + charts, Cyrillic fonts.
3. Building an IPA without a Mac: GitHub Actions macOS runner, unsigned build, TrollStore install.

Also: barcode camera, local DB migrations. Size: **M** (a few weeks of evenings; a usable v1 sooner).
