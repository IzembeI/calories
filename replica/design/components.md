# Components — Калории

Tokens: `tokens.light.json`, `tokens.dark.json` (code: `app/src/ui/theme.ts`). Contrast: `contrast-report.txt`, 0 AA failures in both themes.
Type: iOS system font (SF Pro, Cyrillic built in) — sizes 11/12/13/14/16/17/20/28/44. Spacing 4/8/12/16/24. Radius 8/14/20.
Icons: Unicode glyphs only for v1 (no third-party icon art). Copy: written fresh in Russian.

```
Button      variants primary, secondary, ghost, danger · sizes small 32, default 48
            states default, pressed (opacity .75), disabled (.45), loading (spinner, label hidden)
            tokens primary bg accent / text onAccent; secondary bg accentSoft / text accent
            used on all forms, S01-S03, S06, S19
Field       label (13 muted) + input (17) + suffix; bg input; decimal-pad for numbers, comma accepted
Segmented   2-5 options, active = surface pill on input track; S02, S06, S16
Choice      card with title + hint, selected = accent border + accentSoft bg; S01, S02
Card        surface, radius 20, padding 16; pressable variant
ListItem    title (2 lines) + muted subtitle + right slot; tap and long-press
Ring        kcal ring, track input, fill accent, over goal = danger; S04
Bar         macro / progress bar, over 102% = danger; S04, onboarding progress
Stepper     − value + round buttons (accentSoft), hit slop 8; water, weight
Plus        round accent button 34 px; add to meal / activity
Calendar    month grid modal, today ring, selected filled, dot = day has entries; S05
LineChart   weight / measurement series, dashed target line; S16, S17, PDF
BarChart    kcal per day vs dashed goal, over goal 105% = warn; S16
Empty       centered muted text; every list
```

Accessibility: every control is a native Pressable/TextInput; text sizes follow Dynamic Type through RN defaults; colour is never the only signal (over-goal also changes the ring caption to «ккал сверх»).
