# Alert episode fix

## Verified cause

The original database code checked for an unresolved matching alert, awaited more database work, and then inserted a new record. The check and insert were not atomic. Replaying **the original HEAD version of `server/db.js`** in a temporary JSON database with 10 concurrent Venkatesh low-SpO2 submissions produced **10 different IDs and 10 unresolved persisted alerts**. The fixed implementation keeps one record and one ID for the same submissions.

Other verified lifecycle defects were name-only versus ID-based identities, separate Guardian IDs, recovery that did not close alert records, acknowledgement that affected all conditions for a patient and fabricated baseline vitals, and server deduplication that forgot an episode after acknowledgement. A Guardian demo timer also inserted independent low-SpO2 warnings outside telemetry detection. Regression tests reproduced these defects before implementation. The available local database did not contain the user's observed minute-by-minute records, so that exact historical timing was not replayed.

## Pipeline inspected and changed

`App.tsx` runs the simulator at the existing cadence. `useAppStore.updateLiveVitalsTick` calls `simulateNextVitals`, then `processVitalsTickWithAlerts`. The detector retains its medical thresholds and the patient profiles are unchanged. The episode manager decides create/update/acknowledged/recovered before updating the shared clinician store and Guardian projection. The Watch selects anomalies by matching unresolved episode identity in that same clinician store; the Doctor and Caretaker use that store directly.

The manager persists creations with `POST /api/alerts` and state transitions with `PUT /api/alerts/:id`. The API uses `dbService`, which supports JSON (`data/db.json`) and PostgreSQL. All portals hydrate the same server records; the existing simulator cycle also refreshes authorized alert state across independent browsers. BroadcastChannel/localStorage synchronize tabs. Existing role filtering remains, and alert updates now check access as well.

Physical device ingestion persists telemetry separately; the Venkatesh simulator path is the tested alert-generation path. This change does not introduce a server-side medical detector.

## Exact episode rules

- Identity is normalized elder ID plus canonical anomaly type, for example `elder-3:LOW_SPO2`. Reading, timestamp, severity and generated alert ID never form the key. Legacy known names map to their existing IDs.
- An abnormal reading creates a record only when the condition is armed. Continued abnormalities update its latest reading/message/severity using the same alert ID. Guardian and clinician records use that same ID.
- An active warning can escalate in place. An acknowledged episode stays silenced even if subsequent readings worsen or a manual telemetry trigger is forced.
- Acknowledgement preserves the application's resolved/acknowledged presentation while retaining an `ACKNOWLEDGED_AWAITING_RECOVERY` latch. It does not manufacture healthy vitals or acknowledge other conditions. Explicit simulator stabilization and appointment workflows remain available.
- Recovery uses the existing safe-range hysteresis: SpO2 must reach **95%**. It resolves the record, persists `episode_recovered: true`, and returns the latch to `NORMAL`. The next reading below the unchanged **93% warning threshold** can create one new episode with a new ID.
- Browser lifecycle is stored in `gcare_episode_lifecycle`; alert projections are stored in the existing localStorage keys. Server records persist canonical `anomaly_type` and `episode_recovered`. PostgreSQL initialization adds those two columns without dropping data.
- JSON alert read/modify/write operations are serialized. PostgreSQL creates and updates take an elder row lock inside a transaction, including across server processes. Browser saves are queued so immediate acknowledgement follows its pending creation; server-returned IDs are reconciled, including hydration arriving before the creation response.
- Startup and portal hydration preserve history instead of truncating or deleting alerts by broad type/status matches. Extra open physiological records are marked closed with `duplicate_of` in browser reconciliation, while the representative stays active.

## Safe existing-data cleanup

The inspected local `data/db.json` had only three resolved appointment alerts and **no unresolved Venkatesh low-SpO2 duplicates**. No alert records were deleted or migrated in that file.

If the running/deployed database contains duplicates:

1. Stop telemetry writers and back up the JSON file, or use a PostgreSQL transaction with a database backup.
2. List unresolved records for the exact elder ID and canonical `LOW_SPO2` condition. Review their chronology and telemetry/recovery evidence before treating them as the same episode. Similar messages alone do not prove separate historical episodes were duplicates.
3. Keep the newest representative for each confirmed continuous episode. Record its ID and the exact IDs of stale duplicates.
4. Close only those reviewed duplicate IDs with `resolved: true`. In JSON, optionally retain `duplicate_of: <representative ID>` for audit. Leave the representative open and do not mark its physiology recovered. Do not delete resolved history, appointments, falls, SOS, other conditions or other elders.
5. Save atomically/commit, restart writers, and confirm that continued low readings update the representative ID. A real recovery followed by a drop must create a different ID.

For PostgreSQL, the reviewed-ID operation is deliberately narrow:

```sql
-- Replace the placeholder list with reviewed duplicate IDs only.
UPDATE alerts
SET resolved = true
WHERE id IN ('reviewed-duplicate-id')
  AND elder_id = 'elder-3'
  AND type = 'low_spo2'
  AND resolved = false;
```

Legacy records using other alert types must be classified and reviewed separately. There is no automatic wholesale database cleanup.

## Files changed

Production code:

- `src/lib/alertEpisodeIdentity.js`: shared canonical identity and history-preserving reconciliation.
- `src/lib/anomalyDetector.ts`: episode recovery, exact acknowledgement latch, queued persistence, ID reconciliation and shared Watch selection/hydration.
- `src/store/index.ts`: stable IDs, persistence, scoped acknowledgement and broadcast state.
- `src/store/guardianStore.ts`: initialized/persisted Guardian alerts, shared IDs and scoped acknowledgement.
- `src/lib/syncChannel.ts`: shared alert creation message.
- `server/db.js`: atomic deduplication and persisted lifecycle for JSON/PostgreSQL.
- `server/handlers.js`: episode metadata acceptance and update authorization.
- `src/App.tsx`: server alert refresh on the existing simulation cycle.
- `src/components/WatchSimulator.tsx`: shared episode selection, acknowledgement that leaves physiology intact, and repair of missing existing SOS store references.
- `src/components/guardian/AlertsTab.tsx`: removed the independent synthetic low-SpO2 insertion timer.
- `src/pages/Dashboard.tsx`, `src/pages/DoctorPortal.tsx`, `src/pages/GuardianDashboard.tsx`: shared hydration and acknowledgement, preserving appointments and patient messages.

Tests:

- Added `src/test/alertEpisodeRegression.test.ts`, `alertEpisodePersistence.test.ts`, `alertEpisodePostgres.test.ts`, `alertEpisodeStartup.test.ts`, `alertEpisodeWatchUI.test.tsx`.
- Updated `src/test/alertEpisodeDeduplicationE2E.test.ts`, `anomalyAlertRouting.test.ts`, `vitalsSyncAndAlertDelivery.test.ts`, `workflowE2EValidation.test.ts`, `watchAlertDismissalAndSync.test.ts` to isolate lifecycle/API state and correct the outdated assumption that acknowledgement manufactures healthy vitals.
- Updated `src/test/medicalReportUpload.test.ts` to use a temporary database. Its pre-existing tests wrote into the real project database; exactly two fixture reports generated during baseline testing were removed by their recorded IDs and verified fixture payload. All pre-existing reports and all alerts were retained.
- Added this report, `ALERT_EPISODE_FIX.md`.

## Verification and limits

Final runs: `npm test -- --reporter=dot` passed **113 tests in 14 files**; `npm run build` passed. `git diff --check` passed. The test suite includes five new episode test files and isolated versions of the existing workflow tests.

The tests cover 10 consecutive/concurrent low-SpO2 events, changing readings, automatic recovery without acknowledgement, a later new episode, acknowledgement while still abnormal, reload/hydration, Watch/Guardian/Doctor/Caretaker state, independent conditions/elders, history preservation, immediate acknowledgement and hydration/save races, actual authenticated HTTP endpoints, and rendered Watch warning silence/retriggering.

PostgreSQL adapter tests use a mocked database; no live PostgreSQL server was available. JSON disk persistence and HTTP API tests use real temporary databases. No deployment was performed. A TypeScript diagnostic comparison against original source found **no new errors**; the project already had unrelated TypeScript errors, so a clean full typecheck is not claimed. The requested Vite production build passes with its existing large-chunk warning.

Offline operation retains the existing localStorage fallback. Failed server persistence is reported to the console; independent devices require a reachable server to synchronize. Browser state/API tests and a rendered Watch test do not substitute for a live multi-device deployment test.


## Manual resolution workflow update

Recovery now marks only `episode_recovered`; it never sets `resolved` or guardian `acknowledged`. Pending alerts remain actionable until manual acknowledgement or appointment booking. Recovered pending records are excluded from current-episode deduplication so a later abnormal episode can create a new record. Acknowledgement targets the selected record ID and does not silence a later episode. Existing history is preserved.
