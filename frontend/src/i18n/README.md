# i18n (English / Russian)

Lightweight custom i18n — no external library (no `react-i18next`, no `formatjs`). This
doc is a reference for whoever next touches `frontend/src/i18n/`; it is not marketing copy.

## Architecture

- `I18nContext.tsx` defines `I18nProvider` (wraps the app) and the `useTranslation()` hook,
  which returns `{ language, setLanguage, needsLanguageSelection, t }`.
  - `language`: current `Language` (`'en' | 'ru'`), persisted to `localStorage`
    (`ml-portfolio-language`).
  - `needsLanguageSelection`: true until the user has explicitly picked a language once;
    drives `LanguageSelectionPopup.tsx`.
  - `t(key, vars?)`: looks up a dot-path key (e.g. `t('ecg.workspace.title')`) in the
    active locale, falling back to `en` if the key is missing at runtime, then falling
    back to the raw key string as a last resort. Supports `{{var}}` interpolation.
- `types.ts` defines `Paths<T>`, a recursive mapped type that generates every legal
  dot-path string through a nested object type. `TranslationKey = Paths<typeof en>` in
  `I18nContext.tsx` means `t()` calls are checked against the real shape of the English
  dictionary at compile time — a typo'd or missing key is a **type error**, not a blank
  string at runtime.
- Locale files live in `locales/en/*.ts` and `locales/ru/*.ts`, one file per feature area
  (`common`, `overview`, `autotopic`, `autopilot`, `ecg`, `cassandraGrpc`), merged into a
  single object in each language's `index.ts`.
- `document.documentElement.lang` is kept in sync with `language` via a `useEffect` in
  `I18nProvider` (runs on mount and on every language change), so screen readers,
  browser translate-prompts, and hyphenation see the correct document language.

## The en/ru discipline rule

`I18nContext.tsx` types the locale map as `Record<Language, typeof en>`, i.e. `ru` is
required to be assignable to `typeof en`. This means:

- Adding a key to `en` without adding it to `ru` **is a compile error** (missing
  property).
- Adding a key to `ru` that doesn't exist in `en` **is NOT a compile error** — excess
  properties on an object literal are only checked at the literal's own declaration
  site, and `ru` is a large nested object assigned via a named export, so TypeScript
  does not flag the extra key.

**Practical rule: always edit `en` and `ru` locale files together, in the same change.**
The type system catches one direction of drift, not the other — don't rely on it to
catch a stray/orphaned Russian key.

## No pluralization engine

`{{count}}`-interpolated strings (e.g. `'{{count}} classes'` / `'{{count}} классов'`)
pick **one** reasonable Russian noun form and use it regardless of the numeric value.
Russian plural rules have three forms (singular, paucal, plural) that don't map cleanly
onto a single interpolation slot. This is a known, accepted limitation — not a bug to
fix — because implementing full Russian plural-category selection was out of scope for
this frontend-only i18n plan. If a truly awkward case turns up, prefer rewording the
sentence to avoid needing the plural rather than adding a one-off plural engine.

## Exclusion list — deliberately never translated

The following are left in their original form in both locales, on purpose:

- Code identifiers: variable/function/class names, API endpoint paths, config field
  names (e.g. `sampleSizeCap`, `rp/main.py`).
- Model/library/dataset names: `ECGNet`, `PyTorch`, `TorchScript`, `PTB-XL`, `BERTopic`,
  `scikit-learn`, `TF-IDF`, `Apache Cassandra`, etc.
- The AutoTopic dataset's real backend-returned topic name data (the actual topic labels
  discovered by BERTopic and returned by the API) — these are data values, not UI copy,
  and translating them would misrepresent what the model actually produced.
- Version/build badges and similar metadata strings.

## Permanent limitation: backend-authored dynamic strings stay English

**This is the most important thing to know before touching this system.** Several
backend services return dynamic `note` / `message` / `error` fields that are Python
string literals, surfaced verbatim to the frontend over the API:

- `backend/app/services/autopilot_service.py`
- `backend/app/services/ecg_service.py`
- `backend/app/services/cassandra_grpc_service.py`
- `backend/app/services/autotopic_service.py`

These strings are **permanently English regardless of the selected UI language, by
deliberate design**. This is not an oversight or a bug — translating them would require
either (a) moving the strings into the backend's own i18n system (which doesn't exist),
or (b) building a frontend-side mapping from known backend string literals to translated
equivalents (brittle: breaks silently the moment a backend string is reworded). Both
were judged out of scope for a frontend-only i18n plan. If backend-string translation is
ever wanted, it needs to be scoped as backend work, not bolted onto this frontend layer.

## Accepted exception: pre-translated fallback strings in one-shot error state

The rule everywhere else in this codebase is: **derive translated text at render time**
(call `t(...)` in the render path, or in a `useMemo` keyed on `language`), never store an
already-translated string in component state. Storing pre-translated text in state was a
real, recurring bug during this plan's implementation — text driven by polling or a
mount effect (status labels, live-hardware state, etc.) would go stale after a language
switch because the stored string didn't re-derive. See commits `6d0f20d` ("Fix ECG
live-hardware status text not retranslating on language switch") and `e289a3c` ("Fix i18n
verification findings: RL penalty text, stale-error state, ...") for real instances of
this bug and its fix.

There is one narrow, accepted exception: a handful of user-action-triggered error
handlers store a translated fallback string in state, e.g.

```ts
setError(err instanceof ApiError ? err.message : t('autotopic.errors.pipelineRunFailed'));
```

found in `AutoTopicWorkspace.tsx`, `AutopilotWorkspace.tsx`, `ECGWorkspace.tsx`,
`ecg/EvaluationPanel.tsx`, and `cassandragrpc/InferencePanel.tsx`. This is accepted
because:

- The string is only set once, immediately after a specific user action (clicking
  "Run", "Train", "Predict", etc.) fails — it is not driven by polling or a mount effect.
- The stale-text window only exists if the user switches language while an error banner
  from a *prior* action is still on screen and hasn't been dismissed or superseded — a
  low-traffic edge case.
- Re-deriving it at render time would require also storing which translation key (or
  raw backend message) produced the error, which is a larger refactor for a cosmetic gap.

**Do not generalize this exception.** Anything driven by polling, live state, or a mount
effect must always re-derive its translated text at render time (`useMemo`/boolean-flag
pattern), exactly like the rest of the codebase — that is where the real bugs were.
