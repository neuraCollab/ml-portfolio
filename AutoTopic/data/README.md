# AutoTopic dataset

`data/raw/labeled_requests.parquet` (~118MB) is a real labeled dataset for this
project. It is **not committed to git** -- `AutoTopic/.gitignore` excludes
`data/raw/` because a 118MB binary file doesn't belong in this repo's history
(it would bloat every clone permanently, unlike a source file that can be
diffed/reverted cheaply).

## Where the real file lives

For now, `AUTOTOPIC_DATA_URL` (see root `.env.example` and
`backend/.env.example`) is a placeholder:

```
AUTOTOPIC_DATA_URL=<REPLACE_WITH_GOOGLE_DRIVE_URL>
```

**Once the parquet file is uploaded to Google Drive, replace that placeholder
in both `.env.example` files** (and in your own `.env` / deployment
environment, wherever you actually set it) with the real share URL. It's also
read (as a reference value only) in `backend/app/core/config.py` as
`AUTOTOPIC_DATA_URL` -- exposed for whichever future pipeline code loads this
dataset, but **no pipeline code reads it yet**; the existing AutoTopic
pipeline (`main.py`) still runs on its own bundled `data.csv` sample, unchanged.

## Local development

If you have the parquet file locally, drop it at
`AutoTopic/data/raw/labeled_requests.parquet` -- that path is gitignored, so
it won't accidentally get committed. Nothing currently reads it automatically;
this is deliberately just storage + configuration until a loader is built
against it.
