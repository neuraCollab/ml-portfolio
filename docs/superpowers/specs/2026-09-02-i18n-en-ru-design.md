# English/Russian i18n — Design

Status: approved by user 2026-09-02. Implementation in progress.

## 1. Goal

Add English/Russian internationalization to the existing 4-project ML
portfolio frontend, translating every user-facing string across all
components, with a first-visit language popup, a persistent header
switcher, and zero changes to ML functionality, API calls, or Docker setup.

## 2. Approach

**Lightweight custom i18n** — a React Context, typed TypeScript translation
dictionaries, and a `t(key, vars?)` lookup function — no new npm
dependencies (`react-i18next` was considered and rejected: this is a
2-language, mostly-static-label site with no pluralization needs, and the
app currently has zero state-management/i18n libraries, so a custom
Context matches its existing minimal-dependency style). TypeScript enforces
that the Russian dictionary has every key the English one does, so a
missing translation is a build error, not a silent runtime fallback.

## 3. File layout

```
frontend/src/i18n/
  types.ts                    -- Language union, Translations type, Paths<T> dot-key utility
  I18nContext.tsx              -- Provider, useTranslation() hook, localStorage persistence
  LanguageSelectionPopup.tsx    -- first-visit modal
  locales/
    en/
      common.ts                -- header/nav, footer, language popup copy, shared components (MetricCard/LoadingState/ErrorState/EmptyState)
      overview.ts
      autotopic.ts
      autopilot.ts
      ecg.ts
      cassandraGrpc.ts
      index.ts                 -- merges the six files into one `en` object
    ru/
      (mirrors en/ exactly, same six files + index.ts)
```

Namespacing matches the existing component-folder structure
(`components/ecg/*` -> `locales/en/ecg.ts`), so a translator or reviewer
can find the copy for any component without cross-referencing.

## 4. Key convention

Dot-path string keys, namespaced by area, e.g.:

- `common.header.nav.autotopic` -> `"AutoTopic (NLP)"` / `"AutoTopic (NLP)"` (proper noun, unchanged)
- `common.shared.metricCard.loading` -> `"Loading..."` / `"Загрузка..."`
- `ecg.inference.topClassification` -> `"Top classification"` / `"Основная классификация"`
- `cassandraGrpc.training.sampleSizeLabel` -> `"Sample size"` / `"Размер выборки"`

`t()` is typed against a `Paths<typeof en>` union generated from the merged
English object, so `t('ecg.nonexistentKey')` is a compile error, not a
silent blank string.

**Interpolation:** simple `{{var}}` placeholders, e.g.
`t('ecg.evaluation.notableClassesNote', { shown: 7, total: 19 })` against a
string `"Showing {{shown}} of {{total}} classes"` / `"Показано {{shown}} из {{total}} классов"`.
No pluralization engine — the existing codebase already phrases counts in
a plural-agnostic way (e.g. "N events"), and Russian plural forms for the
handful of count-bearing strings are written by hand per string rather
than via a generic pluralizer.

## 5. What gets translated vs. left alone

**Translated:** every UI label, button, tooltip, heading, description,
error message, loading/empty-state message, form label, chart axis
label/legend, metric card label, results-section copy, warning/disclaimer
text — across Header, OverviewWorkspace, and all 4 project workspaces plus
their subcomponents.

**Left untouched in both languages:** code snippets (`<code>` blocks
showing endpoint paths, file paths, class names), API endpoint strings,
model/file names, config key names, and the AutoTopic dataset's real
Russian topic names (`"Поздравления с днем рождения"` etc.) — those are
*data* returned by the backend, not UI copy, and translating them would
misrepresent what the model actually output. Proper nouns (AutoTopic, ECG,
BERTopic, Cassandra, gRPC) stay as-is in both languages, matching how this
portfolio already presents them.

## 6. Language selection & persistence

- `localStorage` key: `ml-portfolio-language`, values `"en"` | `"ru"`.
- **Active language** on any given render: the stored value if present and
  valid, else `"en"` — never derived from `navigator.language` (explicit
  requirement: browser locale must never auto-select Russian).
- **Popup visibility**: shown whenever the key is absent from
  `localStorage` (this is the one source of truth for "has the user ever
  chosen" — not a separate flag). Selecting either language in the popup
  writes the key and the popup never shows again, until storage is cleared.
- Switching language via the header switcher updates the same
  `localStorage` key and triggers a Context update, re-rendering the whole
  tree with new strings immediately (no page reload, no route change).

## 7. Popup component

- Rendered by `App.tsx`, gated on `!hasStoredLanguage` (computed once in
  `I18nContext` and exposed as `needsLanguageSelection: boolean`).
- Two buttons: **English** and **Русский**. English is visually the
  default/primary-styled option (matches "English must be selected by
  default" — before any choice, the site already renders in English
  underneath the popup).
- Modal overlay consistent with the existing dark-slate visual language
  (same overlay/card pattern conventions as the rest of the app — no new
  design system introduced).
- Responsive: single-column stacked buttons on narrow viewports, tested at
  the same breakpoints the rest of the app already uses (Tailwind's `sm:`).

## 8. Header switcher

- A small `EN | RU` control next to the existing nav in `Header.tsx`,
  always visible (not just pre-first-visit) so the language can be changed
  later, per the explicit requirement.
- Calls the same `setLanguage()` the popup uses — one code path for both
  entry points.

## 9. Component migration pattern

Every component that renders literal English text:
1. Imports `useTranslation` from `frontend/src/i18n/I18nContext.tsx`.
2. Calls `const { t } = useTranslation();` at the top of the component.
3. Replaces every hardcoded UI string with `t('namespace.key')` (or with
   `{{var}}` interpolation where the string embeds a dynamic value).
4. Adds the corresponding key to both `locales/en/<namespace>.ts` and
   `locales/ru/<namespace>.ts` with real, accurate translations (not
   placeholder text) — written by whoever implements that component's
   migration, using the key conventions and example entries in this spec
   and the plan as the terminology baseline (e.g. "Dataset" ->
   "Набор данных" consistently, not "Датасет" in one place and
   "Набор данных" in another).
5. Leaves untranslated content (per Section 5) exactly as it is.

## 10. Verification plan

Matches the user's explicit checklist:

1. Clear `localStorage`, load the site fresh -> popup appears, site
   underneath is already in English.
2. Click "Русский" -> popup closes, entire site (header, current tab's
   content, footer) is now in Russian, immediately, no reload.
3. Reload the page -> still Russian (persisted).
4. Use the header switcher to go back to English -> entire site updates
   immediately.
5. Reload -> popup does **not** reappear (key is set).
6. Clear `localStorage` again -> popup reappears.
7. Click through all 4 project tabs in both languages, confirm no
   leftover hardcoded English strings when in Russian mode (or vice
   versa) via a full page-text read in the browser tool, not just a
   glance.
8. Check the popup and the header switcher at a mobile viewport width
   (375px, matching this app's existing responsive testing convention)
   in both languages — Russian text is on average ~15-20% longer than
   English, so button/nav wrapping is checked explicitly, not assumed.
9. Run the frontend build (`tsc && vite build` via the existing Docker
   build path) and fix any TypeScript/build errors before considering
   this done.

## 11. Explicitly out of scope

- No third language, no automatic browser-locale detection, no
  server-side rendering/locale-based routing.
- No changes to ML functionality, API contracts, Docker services, or the
  4 projects' underlying data/behavior — this is a UI-copy-only change.
- No new npm dependencies.
