# Калории — правила проекта для Claude

Личный счётчик калорий для iPhone владельца (живёт в России). Отвечай по-русски.

## Решения владельца (не менять без его слов)
- Только iPhone. Результат — **неподписанный IPA для TrollStore**, собирается в GitHub Actions (у владельца Windows, Mac нет).
- Данные **только на телефоне** (SQLite), без сервера и аккаунтов. Резервная копия — JSON-файл.
- Интерфейс на русском. База продуктов: встроенная (`app/src/data/basic-foods.ts`, только дописывать в конец) + Open Food Facts + свои продукты.
- Убрано по просьбе владельца: интервальное голодание, вода, журнал активности. Распознавание еды по фото — не делать.
- Замеры тела — ровно 7: вес, шея, грудь, бицепс, талия, ягодицы, бедро. Раз в неделю, не в ежедневном дневнике.
- От пользователя при создании продукта — только КБЖУ. Витамины, минералы и добавленный сахар оцениваются по названию (`app/src/lib/micros.ts`, классификатор RU/EN) и справочнику USDA (`app/src/data/micro-ref.ts`, генерируется `tools/make_micro_ref.py`).
- Цели БЖУ — в процентах или в граммах.
- Картинки продуктов — свои векторные рисунки (`app/src/ui/art-data.ts`, подбор по названию в `app/src/lib/food-art.ts`), работают без интернета; чужие фото не скачивать. Проверка глазами: `node tools/preview_art.mjs out.html`. Иконка и заставка: `python tools/make_icon.py app/assets`.
- Ничего из YAZIO не копировать: ни название, ни логотип, ни тексты, ни цвета. Только функции.

## Как работать
- Код: `app/` (Expo SDK 58, expo-router в `app/src/app`, SQLite-миграции в `app/src/db/migrations.ts` — только добавлять новые, старые не трогать).
- Документация Expo меняется каждый SDK: сверяйся с context7 или docs.expo.dev для v58, не по памяти.
- Даты дневника — локальные строки `YYYY-MM-DD`, никогда не из UTC (`app/src/lib/dates.ts`).
- В регулярках JS `\b` не работает с кириллицей — используй `(?![а-яё])`.
- Перед коммитом: `cd app && npx tsc --noEmit` и `npx expo export --platform ios --output-dir dist-check`.
- Коммиты от `IzembeI <68070108+IzembeI@users.noreply.github.com>` — репозиторий публичный, личную почту не светить.

## Сборка IPA
1. Поднять версию в `app/app.json` (`expo.version`, `ios.buildNumber`) и `app/package.json`.
2. `git push origin main`, затем `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. Workflow `.github/workflows/ios-ipa.yml` собирает IPA и кладёт в Release: `https://github.com/IzembeI/calories/releases/tag/vX.Y.Z`.
4. Проверить IPA: внутри `Payload/Kalorii.app`, `Info.plist` (CFBundleDisplayName «Калории»), `main.jsbundle`.

## Процесс (плагины)
- Пакет replica-skill: recon → architect → design → build → test → diff → entrepreneur (артефакты в `replica/`).
- Ревью: `caveman:cavecrew-reviewer`, `superpowers:requesting-code-review`; iOS-ревью: `mobile-app-design:ios-review`; RN: `react-native-best-practices`; Expo: плагин `expo`.
- На длинных задачах проверять лимит и останавливаться около 90%, если владелец не сказал иначе.

## Плагины на новом аккаунте или компьютере
`bash tools/setup-claude-plugins.sh` — ставит все плагины проекта разом.
