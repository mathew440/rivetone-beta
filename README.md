# RivetOne v0.10.3 — Local review build

Based on the supplied `index-28.html` Final Working Beta. `index.html` and `index-28.html` preserve its Projects, Service dispatch, crew, calendar, materials, plans/measurements/overlays, issues, photos, reports, T&M, safety, and local summaries.

## Backup & Connection

Export all current local records and the last saved value into a ZIP. Includes nested local crew and service/customer records, embedded photos and plan images. Reads only `rivetone-final-v1`; does not collect credentials. Corrupt saved data is protected from overwrite and exported verbatim. Failed saves produce a persistent warning; in-memory work remains exportable. First launch does not overwrite storage with examples.

This app is device-only. Connection labels describe browser connectivity, not cloud health. The original weather and seed records are examples. Full PDF originals are not retained by this beta; only first-page rendered images are stored. Keep originals separately. No automatic restore/import is included. ZIP input limit is 128 MiB.

`index-2.html` and `index.html.html` retain the authenticated v0.8.0 shared app and its separate storage. Use **Backup & Connection → Open shared documents app** to reach it. No cloud database, permissions or subscriptions were changed. Local data is not migrated between these apps or between file:// and HTTPS origins.

The HTML includes its backup implementation, so a downloaded copy does not need an extra JavaScript file. App icons are separate assets; new PDF imports load the existing CDN renderer. HTTPS hosting uses the static-only service worker. Close and reopen while online to update; do not clear site data.

## Validation

`npm ci && npm test` (Node 22.12+). No build step is required for the app.

Dependency-free checks: `node --test field-beta.test.cjs field-scenarios.test.cjs tests/recovery.test.cjs tests/storage-audit.test.cjs`.

## v0.10.0 field workflow update

- Search results stay open; search is available on phones with accessible labels.
- Today filters use the device's local date for project assignments and service calls.
- Callbacks are wired after rendering; completed service calls cannot accidentally cycle back to Scheduled.
- Form saves cannot run twice concurrently. Invalid daily hours and missing dates are blocked. Failed saves restore existing records, retain form entries, and offer draft export. Unsaved forms prompt before dismissal.
- Storage compares its last-read value before saving, stopping common stale-tab overwrites. This is not a multi-user sync system or a fully atomic cross-tab database.
- Plan selections persist on rerender. Measurements use original image coordinates, reject clicks in image padding, and require recalibration of old screen-based scales. Verify physical dimensions before use.
- Material deduplication preserves dimensions and receipt status. Notes are readable under More → Job Notes.
- Job Apps stores per-job HTTPS links (Procore or other web tools) and offers a previewable text handoff. No credentials or automatic cross-app data transfers. Procore OAuth token exchange needs a secure server plus account authorization; it cannot safely be implemented by putting a client secret in this public HTML.
- Append `?practice=1` to the app URL for a clearly marked, memory-only practice session using example records. Reload discards practice changes; persisted jobs are not read or changed.

Run `node --test field-beta.test.cjs field-scenarios.test.cjs tests/recovery.test.cjs`.


## v0.10.1 mobile layout

The mobile mode switch occupies its own row. The bottom navigation occupies a separate flex row, with a scrolling content area above it and safe-area padding. Four service tabs share the full width; the AI control stays inside its bar. Header controls fit narrow screens, and section navigation resets the content scroll.

Open `layout-check.html` and run the browser checks at 320–1180 CSS pixels in both modes. The harness uses practice records only.


## v0.10.2 navigation and icon

Mode switches roll back to the current screen if storage cannot save, retaining the persistent backup warning. Search queries do not trigger unsaved-record dismissal prompts. The selected steel/orange Rivet R is installed as the header, favicon and app manifest icon, with padding for phone masks. Existing installed shortcuts may take time to refresh their icon.


## v0.10.3 usability and recovery changes (draft review)

- One-tap Daily report opens a dated editor. Saved reports can be reviewed, edited, backfilled for other dates, and downloaded as text under More → Reports. Reports stay isolated by project and are included in device backups.
- Daily reports suggest only On Site crew names with blank hours. Old profile hours, assignments and sample weather are never silently treated as verified shift facts. Saved report text is a snapshot; later profile edits do not rewrite it.
- Full-label Daily report, Add photo, Create item and Job note buttons are near the top of Today. Work Items defaults to open records, with explicit All and Closed views, type-aware creation and crew-name suggestions.
- Direct status changes, deletion, project selection, measurement saves and Undo roll back if storage fails. Undo expires after ten seconds and is invalidated by another save or opening a form so it cannot erase newer work.
- Completed callbacks no longer remain in active attention or notification counts. Material entry preserves dimensions such as 1" EMT, 2" EMT and 1 1/4" EMT; use (6), 6 ea or 6 x for counts.
- Nested malformed data is protected from replacement and recoverable as an original backup. Modal dismissal retains its backdrop briefly to catch rapid repeated clicks. Form controls lock during asynchronous save, focus is restored, and long-record phone layouts have wrapping rules.
- Local job messages explicitly say they are not sent. Job links reject credential-bearing query strings and URL fragments.

### Review safely

This is a draft review build based on `db59c261d257b807b43c7bcaf6d831904bf11e17`. The production database, main branch and live app are unchanged. Keep existing site data and export a backup before any later deployment.

Serve the folder with a local static server, for example `python3 -m http.server 8000`, and open `http://localhost:8000/?practice=1`. Practice changes disappear on reload. A local or downloaded copy cannot see records from the deployed HTTPS origin. Use `layout-check.html` for actual browser layout verification.

The revised build passes automated core and jsdom DOM-event tests. jsdom is not a rendering browser: revised phone layout, Safari/iOS, camera/photo decoding, PDF imports, service-worker update/offline launch and physical-device double-tap behavior still need a real-browser pass. See `QA_REPORT.md` for the verification boundary and next priorities.
