# Deterministic Demo Runbook

This runbook rehearses the exact video path without spending model quota or
changing the frozen active result. It combines a live browser execution with the
complete saved agent trajectory from the submitted cohort.

## Why this path

`npm run solution -- --case event-listener` is a real full workflow, but it
depends on provider quota and can produce different wording or archive the
submitted active result. The recording path therefore executes the deterministic
browser harness live and explicitly labels the agent result as the frozen
submitted run. This is reliable, honest, and reproducible.

## Preflight

From the repository root:

```powershell
git status --short
npm run validate
```

Expected result: a clean or intentionally documented worktree, 90 passing tests
across 23 files, and successful core and benchmark builds.

Confirm that no secret-bearing file is visible:

```powershell
git ls-files .env
git check-ignore .env
```

Expected result: `.env` is not tracked and is ignored.

## Rehearsal sequence

### 1. Introduce the project

Open `README.md`. Point to the intended user, measured result, architecture, and
limitations. Do not spend time reading the entire document.

### 2. Execute the browser scenarios

Run:

```powershell
npm run smoke:benchmark
```

Acceptance signals:

- adapter is `direct-cdp`;
- index reports eight cases and `passed: true`;
- every case reports three completed cycles and forced GC;
- `event-listener` reports three retained resources;
- `healthy-control` reports zero retained and three released resources;
- every `browserErrors` array is empty.

If the command fails, do not improvise. Check `CHROME_PATH`, rerun preflight,
and record only after the smoke suite is green.

### 3. Show the retained evidence

Open `results/solution/event-listener/browser-evidence.json` and search for:

```text
"measuredCycles": 3
"forced": true
"domEventListeners": 3
"retainedResources": 3
"heapsleuth:notification": 3
```

Explain that the exact heap size is engine-sensitive. The targeted listener and
benchmark resource signals that remain after GC are the useful evidence.

### 4. Show both agents

Open `docs/TRAJECTORIES.md`. Follow the selected event-listener link and show
the first event, Investigator decision summary, Verifier decision summary, and
final result. If raw JSONL is visually dense, keep the trajectory guide visible
and open the supporting `report.md`.

Expected run ID:

```text
890e02a2-d6f4-4f5c-997b-ab3a35416cba
```

### 5. Show the comparison

Open `results/summary/comparison.md` and point to:

- baseline RCLA: `3/8` (`37.5%`);
- solution RCLA: `5/8` (`62.5%`);
- mechanism accuracy: `2/7` to `4/7`;
- evidence grounding: `1.00` to `3.00`;
- cohort hash in the method boundary.

### 6. Show the removed experiment

Open `results/iterations/verifier-v2/README.md`. Explain the predeclared keep
rule, the regression from `5/8` to `3/8`, and why the prompt was removed.

### 7. Close with reproduction

Open `docs/REPRODUCTION.md`. Show the no-key review commands, full regeneration
boundary, and artifact paths. End on the hot take in `README.md`.

## Backup plan

If Chrome cannot run during recording, use the already validated
`browser-evidence.json` and state clearly that it is saved evidence from the
frozen run. Do not claim a prerecorded artifact is a live execution. The final
video should still show the source, trajectory, comparison, changelog, and exact
reproduction command.

## Final recording checks

- Duration is no more than five minutes.
- Terminal and editor text are readable at normal playback speed.
- No API key, `.env`, email, notification, or personal path is visible.
- The baseline and solution receive the same cases and model family.
- Saved artifacts are described as frozen evidence, not a new live model run.
- The video includes the highest-impact change and rejected `verifier-v2` test.
- Every numeric claim matches `results/summary/comparison.json`.
