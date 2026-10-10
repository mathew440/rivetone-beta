# RivetOne v0.10.0 — Projects & Service

Based on the supplied `index-28.html` Final Working Beta. `index.html` and `index-28.html` preserve its Projects, Service dispatch, crew, calendar, materials, plans/measurements/overlays, issues, photos, reports, T&M, safety, and local summaries.

## Backup & Connection

Export all current local records and the last saved value into a ZIP. Includes nested local crew and service/customer records, embedded photos and plan images. Reads only `rivetone-final-v1`; does not collect credentials. Corrupt saved data is protected from overwrite and exported verbatim. Failed saves produce a persistent warning; in-memory work remains exportable. First launch does not overwrite storage with examples.

This app is device-only. Connection labels describe browser connectivity, not cloud health. The original weather and seed records are examples. Full PDF originals are not retained by this beta; only first-page rendered images are stored. Keep originals separately. No automatic restore/import is included. ZIP input limit is 128 MiB.

`index-2.html` and `index.html.html` retain the authenticated v0.8.0 shared app and its separate storage. Use **Backup & Connection → Open shared documents app** to reach it. No cloud database, permissions or subscriptions were changed. Local data is not migrated between these apps or between file:// and HTTPS origins.

The HTML includes its backup implementation, so a downloaded copy does not need an extra JavaScript file. App icons are separate assets; new PDF imports load the existing CDN renderer. HTTPS hosting uses the static-only service worker. Close and reopen while online to update; do not clear site data.

## Validation

`node --test field-beta.test.cjs tests/recovery.test.cjs`

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
