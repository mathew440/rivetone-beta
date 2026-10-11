# RivetOne usability and QA review

Review date: October 11, 2026
Base: v0.10.2, commit `db59c261d257b807b43c7bcaf6d831904bf11e17`
Deliverable: v0.10.3 draft review build. Not merged or deployed.

## What improved

1. **Daily reporting takes one tap.** A dated editor opens directly from Today. It records crew/actual hours, completed work, blockers/materials, next shift, safety/inspection results and weather. Reports save by project, reopen for review, support earlier dates, and download as text. Backups include them.
2. **Old data is not presented as today's facts.** Only crew currently marked On Site are suggested, with blank hours to fill in. Profile hours, old assignments and sample weather are not copied. Saved text remains unchanged when crew profiles change.
3. **Common field actions are easier to reach.** Labeled Daily report, Add photo, Create item and Job note buttons are above the main dashboard. Open work items appear first; All/Closed views remain available. Punch creation respects the selected type and offers crew-name suggestions.
4. **Failed changes recover consistently.** Status updates, deletion, job switching, measurements and Undo restore prior state when saving fails. Form entries stay available for retry/export. Undo cannot erase a later successful save and clears when opening a form.
5. **Verified defects are addressed.** Completed callbacks no longer count as urgent; material parsing preserves different pipe dimensions; nested corrupt records retain a working recovery route; rapid Save clicks are guarded through modal dismissal; long names have phone wrapping rules.
6. **Local behavior is clearer.** Saves identify this device, job messages explicitly say they are not sent, and credential-bearing URL fragments are rejected along with credential query strings.

## Verification

### Revised code: 80 automated tests passed

Command: `npm ci && npm test` with Node 22.12+ (execution here used Node 24).

- Existing core/recovery scenarios plus one URL-fragment regression: 28 tests.
- Exact-production-handler and data-integrity audit: 25 tests.
- jsdom DOM-event workflows: 24 tests. Coverage includes report creation/edit/reload/download/backfill, project isolation, duplicate-date validation, Save retry, double Save, cancellation/Escape, focus restoration, filters, callbacks, failed direct changes, Undo, protected corrupt data, stale-tab conflicts, material dimensions, long-content markup/wrapping rules and HTML-as-text handling.
- Three bounded stress tests: 250 interrupted mutations/retries; 1,000 material lines; backup of 500 reports, 1,000 notes and a synthetic 1 MiB embedded image.
- JavaScript parsing, standalone-entrypoint equality, inline/helper equality and `git diff --check` passed.

All automated data was synthetic/example data. No production records, databases, authentication settings or cloud permissions changed.

### Deployed v0.10.2 baseline: independent browser checks

- Built-in layout harness: 98 checks passed at 320, 360, 393, 412, 560, 768 and 1180 CSS pixels across Projects and Service home screens.
- Interactive checks covered valid/invalid crew hours, searches, calendar/today assignment, material status/count changes, synthetic photo import, form cancellation, uncalibrated-measure guidance and practice reload reset.
- Found: static unsaved daily draft; completed callback still urgent; rapid Save click falling through to Messages; long crew names overflowing at 320 px. These findings drove the changes above.

### Important boundary

The revised build has **not been visually tested in a rendering browser**. Local Chromium could not launch because the execution environment blocked its process socket. The separate cloud browser could not reach the local review server. jsdom exercises actual DOM/event code but does not validate layout, touch geometry or real image/PDF decoding.

The revised `layout-check.html` also adds long-name crew/action geometry checks at all seven widths; these added rendering checks have not been run here.

Before publication, run the revised build in a real browser and check:

- 320 px long crew names and every tool page; full-screen phone/keyboard/safe-area behavior.
- Rapid double-tap Save and background-navigation isolation.
- Daily report edit/save/reload/download and quota/stale-tab recovery.
- Safari/iOS and Android camera/photo import; large or malformed PDFs.
- Service-worker update, offline launch and offline edits on the deployed origin.

This is substantial regression coverage, not exhaustive testing or a guarantee of zero defects.

## Next useful improvements

1. **Photo-linked punch items:** attach before/after photos directly to an issue, with location, assignee and due date. Fieldwire's task-centered punch workflow is a useful reference.
2. **Validated backup restore:** preview archive contents, validate schema, create a pre-restore backup and make replacement explicit. Current export is useful; automatic restore remains absent.
3. **Multipage drawing support:** retain originals, choose pages and show revision/scale warnings. Current imports still render only the first PDF page.
4. **Navigation history and day rollover:** browser Back currently leaves the app URL rather than stepping through sections, and date-sensitive views should refresh reliably across midnight.
5. **Shared crew and integrations later:** device-only storage is not multi-user sync. Procore/other cross-app synchronization needs an authorized secure backend and conflict handling; it should not be simulated in this static app.

## Comparison sources

- Raken, first daily report: https://help.rakenapp.com/en/articles/14463911-how-to-create-your-first-daily-report-in-raken
- Procore, copying a daily log: https://support.procore.com/products/online/user-guide/project-level/daily-log/tutorials/copy-a-daily-log
- Fieldwire, task-centered punch lists: https://www.fieldwire.com/ie/blog/use-fieldwire-to-manage-punch-lists/

These informed the small, relevant workflow changes; they do not imply feature parity or a live integration.

## Safe review and publication

Unzip into a separate folder. Serve it with a local static server and open `index.html?practice=1` for disposable review. Practice changes disappear on reload. Do not clear the deployed site's data. A local/downloaded origin cannot see the deployed origin's saved jobs.

Keep a current device backup before any later release. Production publication requires approval and a revised-browser pass. No deployment was performed for this review.
