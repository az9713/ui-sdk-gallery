# Build 1 UI of the gallery

You build 1 row of `rows.json`. Your ID is in your prompt.

**Done** means: `npm run gate -- <ID>` prints `GATE PASSED: <ID>` and exits with code 0. Work in `gallery/`.

## Steps

1. **Read your row.** Run `npm run rows -- <ID>`. It prints the title, what the UI shows, the items it adds, and the docs page or heading for each item.
2. **Read the SDK's own instructions.** Read `node_modules/@ui-sdk/core/skills/ui-sdk/SKILL.md` and follow it. Layer 4 and 5 rows use its path 1. Layer 1 and 2 rows use its path 2. The gallery renders with web components, so also read its `references/web-components.md`. Then read the docs that step 1 named. Search `docs/core.md` by heading: it is 403,122 bytes.
3. **Read the reference UI of your kind, with its test file.**
   - Shipped components only: `ui/A01-project-settings.ts`.
   - Own primitive: `ui/B01-seat-map.ts`.
   - Look only: `ui/E01-no-stylesheet.ts`.
4. **Write your 2 files**: `ui/<ID>-<name>.ts` and `ui/<ID>-<name>.test.ts`. `<name>` is lowercase words with dashes.
5. **Run the gate until it passes.** Each failure prints `FAIL <stage>` and the reasons. Correct the UI or its tests. The gate is the judge: when you think that the gate is wrong, stop and report it.
6. **Look at `shots/<ID>.png`.** Done when a person sees the UI of your row's title, with no text cut off and no parts that overlap.
7. **Report** in the format at the end of this file.

## The UI file

The default export is a `UI` object. Its type is in `src/ui.ts`. The row data (title, axes, adds) comes from `rows.json`, so the file does not repeat it.

| Field | What it holds |
|---|---|
| `id` | Your ID, as `id: "B07"`. |
| `request` | The 1-sentence request that a person gives an agent to get this UI. |
| `mount(root, context)` | Writes the markup into `root` and connects the events. `context.agent` is the page's bridge. `context.ask(question)` shows the Allow / Deny prompt and resolves `true` or `false`. |
| `css` | Styles for this UI. Start each selector with `[data-stage]`. Take colors from the `--ui-*` tokens of `skills/ui-sdk/references/styles.md`. |
| `task` | The scripted agent task: `steps` for `agent.act`, and `done(root)`, which reads the DOM and returns `true` only after the task. Add `person: "deny"` when the UI shows a refusal: the task must then end with `ok: false`. |
| `breaks` | Layer 1 and 2 only, minimum 3. Keep it the last field. See "Deliberate breaks". |
| `look` | Set E only: `{ webCss: false }` removes `web.css`, `{ tokens: false }` removes the gallery tokens. |
| `allow` | Set F only: replaces the bridge's permission rule for this UI. |

Rules for the file:

- **Module level holds only imports, constants, `definePrimitive` and `createParts`.** All 100 UIs load in 1 bundle and 1 is mounted. Storage, cookies, listeners and timers start in `mount`.
- **Each tag that you define starts with your ID**, like `b07-track`. Shipped tags keep `ui-`.
- **Each control that an agent uses is an SDK part with a name**: `<ui-button><button>Save</button></ui-button>`, `<ui-field>` with `<ui-input><input /></ui-input>`, or a part of your primitive. The bridge does not see a plain `<button>` or `<input>`.
- **Write the result of an action to a status line**, `<p role="status" data-status>`. `task.done` and the tests read it.
- **Follow state through change events on the element itself**: `valuechange`, `checkedchange`, `openchange`, and `action` on `ui-button`. They do not bubble.
- **Import each item that your row adds.** The gate compares your imports with `rows.json`.

## The test file

- Start each test name with what it proves. The gate requires a minimum of 1 test for each prefix:
  - all rows: `keyboard:`
  - all rows except set X: `agent:`
  - sets B and C: also `server:` (`checkServer`) and `direction:` (`checkDirection`)
- `src/testing.ts` gives you `mountUI(ui)`, `keys(...)`, `settle()` and `tabbable(root)`. `mountUI` makes the 1 bridge of the test file and returns `{ root, agent, person, live }`. Set `person.approves = true` to answer "Allow" to a confirm step. `person.asked` lists the questions.
- Test a primitive with `mount` from `@ui-sdk/core/testing`, as `B01-seat-map.test.ts` does. Test what you wired on the page with `mountUI`.
- Follow `skills/ui-sdk/references/testing.md` for what to test: both arrow directions, exactly 1 tab stop, Space and Enter, each state attribute, each button of each dialog.

### Deliberate breaks

For each key behavior of a primitive, the definition names 1 break:

```ts
breaks: [
  {
    broke: "Focus no longer skips a taken seat.",
    find: "disabled: (cell) => !free(seatId(cell)),",
    replace: "",
    caught: "keyboard: the grid is 1 tab stop, and a taken seat does not get focus",
  },
],
```

The gate replaces `find` with `replace` in your file, runs your tests, and requires that the test named `caught` fails. Then it restores the file. `find` must occur exactly 1 time in the code before `breaks: [`.

## Facts that the reference UIs found

Each one cost a failed run. The docs do not state them.

- **jsdom shows a control in a closed tab panel to the bridge. The browser does not.** A task step for such a control comes after a step that opens its tab: `{ ref: "Settings sections", action: "setValue", args: ["Danger zone"] }`. The browser stage finds this, the tests do not.
- **A control in a closed tab panel does not react in a test.** Open the tab, then `await settle()`, then press the key.
- **A label matches by whole words, and an exact match does not win.** "Seats" matched the grid "Seats" and the button "Book seats". Give each control a word that no other label has.
- **An alert dialog's label is its title, not the text of its trigger.** The step is `{ ref: "Delete this project?", action: "press", args: ["Delete forever"] }`.
- **`data-agent-confirm` goes on the part that confirms**, `<ui-alert-dialog-close value="confirm" data-agent-confirm="Deletes the project and all its files">`. The shell shows the prompt. `openchange` reports the answer in `event.detail.returnValue`.
- **A slot with more than 1 part needs a key prop**: `props: { value: "string", ... }` and `value="B3"` in the markup. Without it, `mount` gave each part `tabindex="-1"`.
- **A part must not read an option.** `checkServer` failed with "`seat` reads option `rows`". Copy the option into state in `state` and `sync`, and let the behavior read `context.store.get()`.
- **A slot's role sets what TypeScript requires.** A `grid` root needs `keys` (or `keys: { none: "why" }`). A `gridcell` needs `focus`. The type error and the strict-mode error both name the missing field.
- **A part that is not a button gets only clicks through `press`.** Handle Space and Enter in `on.keydown`.
- **In a test file, call `mountUI` in the first page test, after the `mount` tests.** Tab in a `mount` view goes to the first control of the document.
- **`checkPattern` has 15 patterns and `grid` is not one of them.** Use it when your pattern is in the list of `references/testing.md`.

## Your files

You write 2 files: the UI file and its test file. Set C also writes `src/behaviors/<name>.ts` and its test.

The gate writes `results/<ID>.json` and `shots/<ID>.png`.

All other files belong to the orchestrator: `src/`, `scripts/`, `rows.json`, `package.json`, the config files, and the files of other UIs. When your UI needs a change there, stop and report the need. The orchestrator commits. You do not run `git commit`, `git checkout`, `git stash` or `npm install`.

## Report

1. The last 2 lines of the gate output.
2. Each fact that the docs or the types did not give you, and how you found it.
3. Each key that you selected with no APG rule.
4. Each thing that you could not check.
5. The files that you wrote.
