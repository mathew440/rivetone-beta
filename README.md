# RivetOne v0.8.0

Field app with shared crew/documents and device-local project records.

## This release

- **Backup & Connection** replaces the demo Sync Center. The old demo button never uploaded local records; the new screen never clears those notices.
- **Export this device** downloads a ZIP of current local state, the last saved state, embedded photos and IndexedDB drawing bytes. It also works from the sign-in screen without granting cloud access.
- ZIP manifests identify missing drawing references and malformed saved records. Unreadable drawings/storage abort the export. The export is capped at 128 MiB of input data and uses no external dependencies.
- Cloud status reflects successful workspace/crew requests, separately from device connectivity, with the last successful check time. A network error is not presented as a confirmed service pause.
- Connected, visible sessions check roughly once per minute. Repeated failures back off up to five minutes; manual retry and returning online remain available. No background keep-alive or paid service is installed.
- `index.html`, `index-2.html` and `index.html.html` serve the same current build. Existing localStorage and IndexedDB names are preserved. The root page now requires the existing cloud sign-in for workspace access; local export remains available before sign-in.
- The service worker caches only explicitly listed static app files, never authenticated requests or Supabase responses.

## Backup limits

Device exports do **not** contain shared originals, shared crew, memberships, authentication tokens, password data, or records from another browser/device. Shared originals and database records need separate backups. Keep backups private. A completed download must be checked by the user; the app reports a download request rather than claiming the OS saved it.

The ZIP is a recovery artifact, not an automatic restore feature. `local-records.json` captures current application state; `last-saved-records.json` captures the persisted version. Drawing keys, types and filenames map to binary files through `manifest.json`. No database schema, permissions or subscriptions change in this release.

## Validation

Run `node --test tests/recovery.test.cjs`. Tests cover ZIP integrity and binary preservation, missing/corrupt data, blocked storage, outage/reconnect/revocation behavior, offline query suppression, and matching entry points/script syntax.

Serve these static files from the existing app origin so installed-device data remains in the same browser storage. Do not clear site data to update. Fully close and reopen the app while online to load the new static assets. Native Android/Windows wrappers, if any, require their own packaging/update; this repository contains the web app only.
