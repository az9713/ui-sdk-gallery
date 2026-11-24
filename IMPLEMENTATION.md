# IMPLEMENTATION — build the 100 UIs with agents

Written 2026-11-23 by Fable 5.2, for an Opus session that dispatches builder agents. You are the **orchestrator**. Each builder builds 1 row and reads `BUILDER.md`.

State on 2026-11-23: 3 of 103 rows are built and pass the gate (A01, B01, E01). 100 rows are open.

## What this file replaces

`../PLAN-100-uis.md` stays the source for the reasons: why these 100 rows, the 3 orthogonal axes, the 6 decisions. This file replaces its sections 6, 7 and 8, and these 5 points:

| The plan said | Now |
|---|---|
| Pilot of 6 UIs (A01, B01, B04, D01, E03, F12), then stop for review | 3 reference UIs are built: A01, B01, E01. No stop. |
| Gate 3 by the chrome-devtools tools | `scripts/gate.mjs` drives the installed Chrome with `puppeteer-core` and `axe-core`. |
| 1 file for each UI, with in-source tests | 2 files for each UI: `ui/<ID>-<name>.ts` and `ui/<ID>-<name>.test.ts`. |
| The UI file holds the card data | `rows.json` holds the row data. The UI file holds only `id`, `request`, `mount`, `task`. |
| A maximum of 3 subagents, after a second question to the user | See "Confirm 3 defaults". |

## Confirm 3 defaults with the user, then run

The user has not answered these. Ask 1 time, at the start, in 1 message. Then do not stop for the user again before phase 4.

1. **Agents at the same time:** default 3.
2. **Failure rule:** default 3 gate attempts by the builder, then 1 new builder at the next model or effort, then the row stays "Not built" and goes in the final report.
3. **Cost limit:** default none. Phase 1 gives the first measured cost of an Opus and a Sonnet builder. Offer the user a stop after phase 1.

## Commands

| Command | Use |
|---|---|
| `npm run rows` | Checks `rows.json` against the installed packages. Prints the rows that are built and the components and behaviors with no row. |
| `npm run rows -- <ID>` | Prints the brief of 1 row: title, what it shows, model, effort, note, and the docs page or heading of each item that it adds. |
| `npm run gate -- <ID>` | Runs the 7 stages on 1 UI, on a build that holds only that UI. Safe to run for 2 different IDs at the same time. |
| `npm run check` | Runs the stages on each built UI on the full bundle, then writes `dist/index.html`. Run it only when no builder runs: the break stage of a builder changes a UI file for some seconds. |

The 7 stages: `source` (files, imports against `rows.json`, module level), `types` (`tsc`, filtered to the UI's files), `tests` (Vitest, required name prefixes), `build`, `browser` (console, tag prefix, snapshot labels, accessibility-tree bytes, Tab walk, axe WCAG A and AA, the scripted agent task with the Allow / Deny prompt, screenshot), `design` (`impeccable detect`, 0 findings), `breaks` (sets B and C: each deliberate break must make its named test fail).

## Models and effort

The user asked for a model and an effort for each row. They are the `model` and `effort` fields of `rows.json`, in the values of the Agent tool. Pass them through.

| Model, effort | Rows | Count |
|---|---|---|
| `sonnet`, `medium` | Set A rows with 1 to 3 simple components, E02, E03 | 13 |
| `sonnet`, `high` | Set A rows with composite components or a utility entry, set B rows with 1 behavior family, E04, E05, X01 to X03 | 37 |
| `opus`, `medium` | F01, F03, F10, F12, F13, F14: shipped components, 1 bridge rule each | 6 |
| `opus`, `high` | Set B rows with pointer work or more than 1 behavior family, A22, A27, A29, C02, C04, set D, the other set F rows | 40 |
| `opus`, `xhigh` | B04, B06, C01, C03 | 4 |

- **Orchestrator:** Opus at `high`. Use `xhigh` for phase 3.
- **This split is my estimate.** No Opus or Sonnet builder has run. Phase 1 tests it.
- **Escalation:** `sonnet medium` → `sonnet high` → `opus high` → `opus xhigh`. One step for each failed row.

## Phases

### Phase 0 — start (orchestrator, no builder)

1. Run `npm run check` and `npm run rows`. Done when both exit with code 0 and `check` prints `GATE PASSED: A01 B01 E01`.
2. Read `BUILDER.md`, `src/ui.ts`, and the 3 reference UIs with their tests.
3. Ask the 3 defaults.

### Phase 1 — calibration (3 builders)

1. Dispatch A02 (`sonnet medium`), B03 (`sonnet high`) and B02 (`opus high`).
2. Accept each one (see "Accept a builder's work").
3. Record for each: the wall-clock time, the token count if the Agent tool reports it, the count of gate attempts, and each docs gap that the builder reported.
4. If a builder reports a fact that `BUILDER.md` does not have and that cost it a failed run, add 1 line to "Facts that the reference UIs found".

Done when the 3 rows are committed or marked failed, and the 3 records are in `../HANDOFF.md`.

### Phase 2 — fan-out (86 rows)

All open rows of sets A, B, E, X and F, except A27 and F11, which are in phase 3. Order: set A, then set B, then E02 to E05 and X01 to X03, then set F.

- B20 goes early: set D needs its primitive.
- X02 and X03 go after B17 exists. Build X01 first and alone: the gate path for set X (no bridge, no task) is written and has not run. If it fails, correct `scripts/gate.mjs`.
- After each 10 accepted rows, run `npm run check` with no builder active. The full bundle shows 2 defects that a 1-UI build cannot: a tag that 2 UIs define, and a UI that works at module level.

Done when `npm run rows` lists each of the 86 rows as built, or the row is in the failure list.

### Phase 3 — the shapes that no run has verified (11 rows, serial, Opus)

`rows.json` marks 9 of these rows `UNVERIFIED SHAPE`. C02 and C04 follow C01 and C03. For each, the builder proves the shape with the smallest test first and reports before it builds. You change the shared files.

| Rows | What is not verified | Shared files that can change |
|---|---|---|
| A27 | How "server markup first" shows in a bundle that defines each element at load | none expected |
| C01 to C04 | Which 2 behaviors the package does not ship. If the docs search finds none, change the 4 rows to set B rows in `rows.json` and say so on the index page. | `rows.json`, `src/behaviors/` |
| D01 to D05 | The React, Vue, Svelte and Solid adapters, their compilers, and 1 bridge for 5 adapters. Evidence for the bridge: `@ui-sdk/web/agent` re-exports `@ui-sdk/core/agent`. Install each adapter at `0.1.0-beta.16`. | `package.json`, `scripts/build.mjs`, `vite.config.ts`, `scripts/gate.mjs` |
| F11 | A UI that reads the results of all UIs. `Context` in `src/ui.ts` does not pass them. Build F11 last. | `src/ui.ts`, `src/shell.ts` |

Done when each row is built, or is in the failure list with the result of its smallest test.

### Phase 4 — close

1. Run `npm run check`. Done when it prints `GATE PASSED` with each built ID.
2. Publish `dist/index.html` as 1 private Artifact: inline `gallery.js` into the page. **Not verified:** that an Artifact loads the bundle, and that `?ui=<ID>` with a page load works there. If it fails, the gallery stays a local file. Report that.
3. Update `../HANDOFF.md`: rows built, rows failed with the reason, measured cost, docs gaps.
4. Report to the user.

## Dispatch a builder

Use the Agent tool with `subagent_type: "general-purpose"`, and `model` and `effort` from the row. The prompt:

```text
Build row <ID> of the UI SDK gallery.
Work in <project-folder>\gallery.
Read BUILDER.md there first and follow it. It defines "done" and your report.
<Add only what BUILDER.md and `npm run rows -- <ID>` do not say: a result of an earlier row that this row depends on.>
```

1 builder builds 1 row. The row's brief is the output of `npm run rows -- <ID>`: the builder reads it in its step 1.

## Accept a builder's work

A builder's report is a claim. The gate's exit code is the evidence.

1. Run `npm run gate -- <ID>` yourself. Accept only `GATE PASSED: <ID>`.
2. Run `git status --short`. Expect 4 paths: the 2 `ui/<ID>-` files, `results/<ID>.json`, `shots/<ID>.png`. For a different path, read the diff and keep it only if you decide that the shared file needs it.
3. Read `shots/<ID>.png`. Accept when it shows the UI of the row's title, with no text cut off and no parts that overlap.
4. Read the UI file for 2 things that the gate cannot see: a control that the row's title needs but that the page does not have, and a test that asserts nothing about the behavior in its name.
5. Commit the 4 paths with the message `<ID> <title>`.

When a step fails, send the reason to the same builder with SendMessage. Count that as a gate attempt.

## Evidence that the gate checks what it says

On 2026-11-23 I planted 1 defect for each stage in A01 or B01 and ran the gate. Each run below exited with code 1.

| Stage | Planted defect | Gate output |
|---|---|---|
| source | The file does not import `tabs`, which the row adds | `FAIL source` |
| source | `document.title = "seed"` at module level | `FAIL source` |
| types | A `gridcell` slot with no `focus` field | `FAIL types` |
| tests | No test name starts with `agent:` | `FAIL tests` |
| tests | An assertion that is wrong | `FAIL tests` |
| browser | `console.error` in `mount` | `FAIL browser` |
| browser | A plain `<button>` with no name | `FAIL browser`, axe `button-name` |
| browser | Status text at a contrast of 1.72:1 | `FAIL browser`, axe `color-contrast` |
| browser | A listener that stops Tab | `FAIL browser`, "Tab does not leave the UI" |
| browser | `task.done` that always returns `true` | `FAIL browser` |
| browser | A task step for a control in a closed tab | `FAIL browser`, "No component … on the page" |
| design | A bounce easing in the UI's CSS | `FAIL design`, `bounce-easing` |
| breaks | A break that names the wrong test | `FAIL breaks` |

Two of these stages passed a planted defect on the first run, and I corrected them: the module-level check (a wrong pattern) and the design stage (the detector's exit code is lost on Windows, so the stage now reads its JSON output).

Checks with no planted defect of their own: the tag prefix and an SDK button with no name (the tests stage caught both first), a shell control in the snapshot, the prompt in the snapshot, and a contrast result that axe cannot decide.

## What the gate does not check

- Contrast in the states after the first paint: hover, focus, open, selected, invalid. axe runs 1 time, on the first state.
- The 3:1 contrast of control edges and focus rings. I computed it for the gallery tokens (`--ui-input` on `--ui-background` 3.8:1, `--ui-ring` 8.3:1). A UI that sets its own edge colors needs its own check.
- A screen reader, a real phone, and touch input.
- That the UI is a sensible design for its title. Step 3 and step 4 of "Accept a builder's work" are the only check.

## Numbers measured on the 3 reference UIs

| UI | Lines | Tests | Tab stops | Bridge snapshot | Accessibility tree | Deliberate breaks caught |
|---|---|---|---|---|---|---|
| A01 | 110 | 5 | 4 | 588 bytes | 343 bytes | not applicable |
| B01 | 219 | 10 | 2 | 171 bytes | 2,104 bytes | 4 of 4 |
| E01 | 13 | 3 | 4 | 588 bytes | 341 bytes | not applicable |

- "Accessibility tree" is my measurement: 1 line of text for each node of Chrome's accessibility tree of the stage, with role, name and state.
- Time: A01 took about 5 minutes and B01 about 11 minutes, by Fable 5.2, with the gate under construction at the same time. These are not Opus or Sonnet times.
- Tokens: not measured.
- Full bundle with 3 UIs: `dist/gallery.js` is 457,677 bytes.
