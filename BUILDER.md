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
5. **Run the gate until it passes.** Give the command a timeout of 600,000 ms: the gate for B01 takes 64 seconds, and each deliberate break adds a test run. Each failure prints `FAIL <stage>` and the reasons. Correct the UI or its tests. The gate is the judge: when you think that the gate is wrong, stop and report it.
6. **Look at `shots/<ID>.png`.** Done when a person sees the UI of your row's title, with no text cut off and no parts that overlap. When the brief has a `Visual` line, the screenshot must also show that domain and that visual.
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

## Visuals and libraries

Rows with `Domain`, `Visual` and `Library` lines in their brief must show that data domain and that look. The first 50 UIs are mostly text; these rows add variety in data and presentation. The row's "Shows" behavior stays the thing that the tests and the gate prove; the visual is drawn around it.

- **Library values:** `d3` (7.9.0), `gsap` (3.15.0), `three` (0.186.1), `matter` (`matter-js` 0.20.0), `waapi` (`Element.animate`), `canvas` (2D canvas), `svg` (inline SVG), `css`. All are installed. Import only the named items you use: `import { scaleLinear, line } from "d3"`, `import * as THREE from "three"` is too large, import the classes. Do not add other packages.
- **Data is made in code.** No `fetch`, no files, no URLs. Use a seeded random function for generated data, so the screenshot is the same on each run.
- **Start drawing, loops and timelines in `mount`.** Module level holds only imports and constants. Stop a `requestAnimationFrame` loop when `root.isConnected` is false.
- **Reduced motion:** when `matchMedia("(prefers-reduced-motion: reduce)").matches`, show the end state with no animation.
- **The agent cannot see canvas or WebGL pixels.** Give a `<canvas>` `role="img"` and an `aria-label` that states the data, or `aria-hidden="true"` when an SDK control or the status line already holds it. Decorative SVG gets `aria-hidden="true"`. The values that an agent needs stay in SDK parts or the status line.
- **Text drawn in SVG counts for axe contrast.** Use the `--ui-*` tokens or colors with 4.5:1 on their background. Text on a gradient or a picture fails.
- **Size:** keep the visual inside the stage. WebGL: 1 renderer, `antialias: true`, size it to its box, and `dispose()` nothing at module level.
- **jsdom has no canvas 2D context and no WebGL.** Guard with `const ctx = canvas.getContext("2d"); if (!ctx) return` (and the same for WebGL) so tests run.
- **No animation end gates a state.** Write the state and the status line at once; the animation only follows. `task.done` and the tests read the DOM.
- **The gate takes the screenshot 300 ms after mount.** Draw the visual in its full first state in `mount`, before any intro animation. A blank or half-drawn chart in `shots/<ID>.png` is a fail.
- **Headless Chrome of the gate has WebGL2** (checked 2026-11-24). A console warning or error from a library fails the browser stage.
- **Do not flatten the assigned look to pass the design stage.** When `impeccable detect` reports a finding that the Visual line asks for (a neon glow, a CRT or pixel font, a skeuomorphic gradient), stop and report the exact finding line. The orchestrator adds a `DESIGN_EXCEPTIONS` entry in `scripts/gate.mjs`. Correct every other finding.
- **If the library cannot work, keep the visual.** Draw it with `svg` or `canvas` instead, and say so in the report.

## The test file

- Start each test name with what it proves. The gate requires a minimum of 1 test for each prefix:
  - all rows: `keyboard:`
  - all rows except set X: `agent:`
  - layer 1 and 2 rows (an own primitive): also `server:` (`checkServer`) and `direction:` (`checkDirection`)
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
- **axe fails the gate when it cannot decide a contrast.** (A02, A03.) `web.css` draws icons on some parts: the password toggle, the checkbox indicator, the OTP separator, the number-input step buttons. Leave those parts empty, with an `aria-label` where they are buttons. A `−` or `+` character in them fails. The OTP input has inline transparent text: `[data-stage] ui-otp-input input { opacity: 0 !important; }` clears it.
- **An item label that holds a hint does not match a short label.** (A03.) `setValue "Overnight"` failed on the radio labeled "Overnight ($24.00, next day)". Use the item's value in the step, or keep the hint out of the `<label>`.
- **Do not name a slot after an HTML void element** (`track`, `source`, `input`, `img`, `col`, `area`). (B03.) `<track value="A">A</track>` put the text outside the part.
- **The web renderer does not reorder the DOM.** (B03.) For a list whose order changes, the root slot's `bind` subscribes to the store, re-appends the items in the new order, and keeps focus. `mount` from `@ui-sdk/core/testing` does not run the root `bind`: assert order from `view.api` or state there, and assert DOM order in the `mountUI` test.
- **`checkDirection` fails on a vertical list** ("ArrowRight changes nothing … no direction to check"). (B03.) Write the `direction:` test by hand: set `document.documentElement.dir` to `ltr` and `rtl`, press the same keys, and assert the same result.
- **The root's `render: (el, instance) => cleanup` hook of `createParts` can move items.** (B02.) It is in the `OwnerConfig` JSDoc of `@ui-sdk/web/dist/define-element.d.ts`. B02 uses it to put each card in its column, and focus stays on the moved card.
- **The design stage fails a skipped heading level** (`skipped-heading`): the page title is `h1`, so sections start at `h2`. (B02.)
- **`document.elementFromPoint` returns nothing in a `mount` drag.** (B02.) For an own drop target, test `getBoundingClientRect` of the target elements.
- **`mount` gives each element its own `getBoundingClientRect`** (a stack of 200 x 40 boxes by sibling index). (B05.) A stub on `Element.prototype` has no effect there: define it on each element. `view.drag` starts at the element's center and has no modifier option; dispatch `PointerEvent`s yourself for Shift or Escape during a drag.
- **An own primitive's `element.api` has only the methods that the root lists**: `createParts(p, { root: { tag: "b05-photo-grid", api: ["clear"] } })`. (B05.)
- **Pointer drag in jsdom needs a stub of `getBoundingClientRect`.** (B03.) Use `view.drag` from `mount`.
- **In jsdom, setting `.value` from code or sending an `input` event does not fire `valuechange`.** (A05: `ui-textarea`, `ui-date-input`, `ui-time-input`.) In a test, call `element.api.setValue(...)`. In the UI, read the value when the person submits.
- **A refused `setValue` returns `ok: true` with `steps[0].result === false`**, not `ok: false`. (A04.)
- **Put an `aria-label` on a composite root** (date picker, calendar). (A04.) Without it, the bridge label is the first input's label or a heading that changes.
- **The design stage measures contrast that axe does not.** (A04.) `web.css` gives `data-disabled` parts opacity 0.5 (1.2:1 on unavailable days). Set `opacity: 1` and mark the state another way.
- **`web.css` does not style `data-slot="row"`**, which docs examples use. (A04.) Lay out such a row yourself.
- **`console.log` does not show in Vitest output here.** (A04.) Write probe output to a file in your scratchpad.
- **A dialog's trigger is not its own bridge entry.** (A06.) The dialog entry has the dialog's title as its name: `{ ref: "Command palette", action: "press" }` opens it.
- **axe fails a scrollable `<pre>`** (`scrollable-region-focusable`). (A06.) Give it `tabindex="0"`, `role="region"` and an `aria-label`.
- **jsdom lacks `form.requestSubmit()` and `Range.getBoundingClientRect`.** (A07.) Stub them in the test file. A `ui-trigger-menu` gets `label: null` in the snapshot whatever you set; A07 gave it `data-agent-hidden` and let the token input carry the agent's edits.
- **`mount` renders a slot as `<input>` only when its `attrs` has a string `type`.** (B20.) Without it a `focus: "native"` slot is a `<div>`. A slot named `input` works when the web tag is a wrapper with `target: wrappedChild("input")`.
- **In `mount`, an absent part is a detached node with `.hidden === false`.** (B20.) Test presence with `isConnected && !hidden`.
- **axe fails `label-content-name-mismatch` when an `aria-label` does not contain the visible text.** (A10.) Write "Account menu for Hollis Grant", not "Account menu", and use the whole string as the step's ref.
- **An expanded `ui-tree-item` branch fails axe `label-content-name-mismatch`.** (A12.) Start each branch collapsed. A `setValue` on a file in a closed folder does not reveal it: call `tree.api.reveal(path)` in `valuechange`.
- **An item's bridge label is its text content with no added space.** (A13.) `Launch checklist<small>Mara</small>` reads "Launch checklistMara". Put a space before the inner element.
- **The rating's bridge `setValue` does not work** in `0.1.0-beta.16`: each number fails with "No item 4 in …". (A15.) Leave the rating out of the task and record it with `test.fails`.
- **jsdom gives a carousel 1 page.** (A15.) Stub `getBoundingClientRect`, `offsetWidth`, `clientWidth`, `scrollWidth` and `offsetLeft` in the test file.
- **A toast, a drawer and an alert dialog are each 1 bridge entry with their title as the label.** (A20, A21.) Press an inner button by text: `{ ref: "Message archived", action: "press", args: ["Undo archive"] }`. The `keys` helper names Space `"Space"`, not `" "`.
- **A design `cramped-padding` finding can come from the shell's snapshot box, not your UI.** (A18.) A snapshot line longer than about 34 characters wraps and fills it. A button inside a list or timeline item adds a `"row"` line with the whole item text. Keep such buttons out of items. Long item labels (B08: "Design review, Tuesday 14:00 to 15:30") and a long dialog description (A29) did the same: keep bridge labels short.
- **Do not use `data-empty` on your own elements inside a date or time input.** (A24.) The input's separator segments carry it.
- **The shell's `ui-overlay-host` is hidden from the bridge.** (A29.) For an overlays confirm the bridge must see, use `createOverlays()` from `@ui-sdk/core/overlays` plus `createConfirm({ overlays })`, and put your own host inside the stage. The shell's Allow / Deny prompt takes focus and closes non-modal popovers: set `dismissible="false"` on them while a confirm is pending.
- **jsdom has no `ClipboardEvent`, and strict mode refuses a plain `Event` for the `paste` reason.** (B04.) Define a `ClipboardEvent` class with a `clipboardData` stub in the test file. A Shift press in jsdom needs a real `PointerEvent`.
- **The design stage fails text wider than about 80 characters** (`line-length`). (B04.) `max-width: 60ch` passes.
- **Strict mode refuses the reason `imperative` with an event.** (B06.) Call `zoomBy` or `fit` with no event from a button, or use a reason of your own. An agent action must not have the name of a behavior on the api (`connect`, `move`, `viewport`). `keys()` of `src/testing.ts` takes `Shift`, `Control` and `Alt`; `view.keys("+")` of `mount` sends nothing.
- **`spans.spanStyle()` has no final semicolon in the browser** (jsdom has one). (B07.) Join your own style to it with `"; "`. It sets only the position along the track.
- **`web.css` makes an inline `<svg>` under a slot 1rem wide** (`[data-slot] > svg`). (B09.) Set its width and height in your CSS. Only the screenshot shows this.
- **A first gate pass can differ from the second.** (B12.) The shell shows the bridge snapshot only once `results/<ID>.json` exists, so `cramped-padding` from long snapshot lines can appear on the second run. Run the gate 2 times before you report.
- **jsdom has no `Element.scrollTo`, and the `ResizeObserver` of `src/setup.ts` never reports.** (B12.) Stub both in the test file.
- **`PartDisplay` refuses `"grid"` and `"flex"`.** (B11, B12.) Use `"block"` in `createParts` and set grid or flex in CSS. In `task.done`, use `hasAttribute("hidden")`: `.hidden` has the type `boolean | "until-found"`.
- **axe fails `color-contrast` on a gradient background and on options outside a scroll window.** (B14, B17.) Draw a track with a plain color (`::after`), and give options outside the visible rows opacity 0. The design stage fails `overflow: hidden` on a box with absolutely positioned children (B13).
- **`checkPattern(root, "tree")` requires type-ahead.** (B16.) Add `createTypeahead`. `checkDirection` passes on a vertical tree whose first item is a closed branch.
- **The design stage reads `border-inline-start` with a radius as `side-tab`** (B40). Use a 1px border on all sides.
- **jsdom's `canvas.getContext` prints "Not implemented" and returns nothing.** (B40.) Stub `HTMLCanvasElement.prototype.getContext` to return `null` in the test file.
- **three 0.186.1 works in the gate's Chrome with 0 console messages** (B40, WebGL2, `antialias: true`). Named imports tree-shake; `WebGLRenderer` alone adds about 1.2 MB to the unminified gate build.
- **With `closed: true`, the bridge refuses an unknown item before your api's throw runs.** (B40.) Test the api's throw directly, not through an agent step.
- **The jsdom canvas message makes `npx vitest` exit 255 in Windows PowerShell 5.1** (B27). Run vitest from Bash, or stub `getContext`.
- **In `mount` of `@ui-sdk/core/testing`, `el.getAttribute` cannot read a part's props.** (B27.) Read them with `elements<Props>(context, "<slot>")`.
- **A canvas can be painted from the root `render` hook of `createParts`** and redrawn from `instance.subscribe`. (B27.)
- **matter-js 0.20.0 warns in the console when `Engine.update` steps more than 1000/60 ms.** (B32.) Step by exactly 1000/60 and carry the rest. `Body.setVelocity` takes px per 16.667 ms step. `import Matter from "matter-js"` works with tsc, vitest and the build.
- **`view.drag` does not control time.** (B32.) To test velocity, dispatch your own `PointerEvent`s and set `timeStamp` with `Object.defineProperty`. A dispatched `PointerEvent` reports `source: "programmatic"`.
- **When an agent names an item by its label, the bridge passes the item's value to any action** of a primitive with `agent.items` (B32: "Ginkgo" arrives as "ginkgo").
- **axe cannot decide the contrast of `<text>` inside an inline `<svg>`** ("contains an image node"). (B25.) Put chart labels in HTML and keep only shapes in SVG. A line drawn by `::before` behind text has the same problem; inset `box-shadow` passes.
- **An option of kind `"value"` that holds an object is not read from an attribute.** (B25.) Pass `options: () => ({ ... })` on the root in `createParts`.
- **`vi.useFakeTimers()` around a hold made `settle()` hang 5 s on the page.** (B23.) Use real waits. A change that `bindHold` makes after its timer reports `source: "programmatic"`.
- **The design stage reports `nested-cards` for a shadowed button inside a shadowed panel, and `border-accent-on-rounded` for a thick `border-bottom` with a radius.** (B24.) Use a 1px border and an inset `outline`.
- **`bindRepeat` ignores the click after a real press only when `event.detail >= 1`.** (B24.) `el.click()` has `detail` 0; send `new MouseEvent("click", { detail: 1 })` in a test. `gsap.to` on SVG `attr` works in jsdom.
- **The design stage rejects a `transition: height` panel (`layout-transition`), an uppercase kicker (`all-caps-body`) and a kicker above a heading (`kicker-above-heading`).** (B26.) Animate opacity on `data-starting-style` / `data-ending-style`. A closed `hidden="until-found"` element still paints its own border and padding: put them on an inner element.
- **Trigger buttons inside an own primitive are folded into the root entry's `buttons`.** (B26.) A `press` step on them fails; use the root's own action, `{ ref: "<root label>", action: "toggle", args: ["Gold"] }`.
- **The gate serves the page from `file://`.** (B29.) Chrome stores no cookie there and logs a console warning on each `document.cookie` access, which fails the browser stage. Keep a cookie choice in memory on a `file:` page. jsdom does not apply `inert` for a modal popover. CSS anchor positioning works in the gate's Chrome.
- **`ui-preferences` draws no background, padding or border.** (B28.) Style a `div` inside it. HTML labels over an inline SVG need a solid `background` for axe. An inset `box-shadow` stripe reads as `side-tab`.
- **The design stage fails `text-occlusion` when 2 axis labels touch** (B30: "0 km" on "0 m"). `onValueCommit` fires a `valuecommit` DOM event (name in `custom-elements.json`). Pass restored data to a root as `data-*` JSON read by `options: (el) => ...`.
- **A `value="…"` attribute on a root makes the primitive controlled** and it ignores its own changes (B31). Use `default-value="…"` in markup. `onPreviewChange: "callback"` makes the element fire `previewchange`.
- **The gate can fail "the UI did not mount in 10 s" when many gates run at the same time.** (B31, 8 builders.) Run it again before you change code.
- **The design stage reports `text-occlusion` when one button covers part of another button's box** (B35: black piano keys over white keys). Put the covered button's label in a `<span>` in its visible part. A gate that fails at launch with "The browser is already running for …puppeteer_dev_chrome_profile" is a profile clash between 2 gates: run it again.
- **Start Web Audio only in a person's click or key handler** (B35). An agent action sends no DOM event, so it never creates an AudioContext. `createRovingFocus` reads the nearest `dir`; set `dir="ltr"` on a root whose layout must not mirror.
- **A negative SVG `<rect>` width is a console error that only the browser stage shows** (B33). Clamp generated sizes to 0 or more. jsdom can play the on-screen keyboard: stub `window.visualViewport` before mount, lower its height, dispatch `resize`.
- **axe fails arrow glyphs `←↑↓→` as a label** ("contains only non-text characters") (B37). `formatShortcut` wraps its text in U+2066 and U+2069; remove them in tests and status text. `isApple` is not exported: test `formatShortcut("mod+k").includes("⌘")`.
- **`position()` reads `offsetWidth`, `offsetHeight` and `documentElement.clientWidth/clientHeight`, all 0 in jsdom** (B34). Stub the 4 to assert exact coordinates. A `ui-toolbar` inside an own primitive is 1 bridge entry named by its `aria-label`: `{ ref: "Selection tools", action: "press", args: ["Imagery"] }`. The snapshot does not keep the order of `agent.actions`.
- **Design stage `flat-type-hierarchy` counts the shell's 14px h2 and 20px h1** (B36): a 17px h3 failed (1.21:1, target 1.25:1), 18px passed. `cramped-padding`: 15px text on a background needs 4.5px or more above and below, 8px at the sides. A gridcell with `tabindex="-1"` takes focus on click; give black or dead cells no tabindex.
- **jsdom has no `matchMedia`.** Call `window.matchMedia?.(...)`.
- **The gate does not emulate reduced motion.** Test the reduced-motion path in a unit test with a `matchMedia` stub.
- **`checkPattern` has 15 patterns and `grid` is not one of them.** Use it when your pattern is in the list of `references/testing.md`.
- **A set E row spreads A01 and sets `css: undefined`** (E01, E02). `look: { tokens: false }` sets `data-tokens="off"` on the root (`src/shell.ts:31`); `web.css` stays on.
- **`data-ui="<ID>"` is on the stage section (`src/shell.ts:45`); `.g-stage` has no background (`src/shell.css:78`)** (E03). A token theme on `[data-ui]` changes the controls, not the stage: the dark page shows through and axe fails contrast. Set `background: var(--ui-background); color: var(--ui-foreground)` in the same block.
- **`data-slot` is on the native inner element for button, input, tab, trigger and close; on the `ui-*` host for field, switch, select, tabs, panel and content** (E04). Without `web.css`, select content and alert dialog content and backdrop have no position: add `position: fixed` / `absolute` yourself.
- **`web.css` is at `node_modules/@ui-sdk/core/dist/web.css`** (E05). It has no `forced-colors` rule and almost no transition, so a reduced-motion row must add its own motion first.
- **`settleDraft`: core.md says Drag and Drop shows it, but no example there uses it** (B39). The wait is only in `dist/foundation/kernel/draft.d.ts`: an owner that keeps the old value shows it again 1 task later. `rerenderOf` is not exported from `@ui-sdk/core/testing`. `bindDrag` `onEnd`'s pointerup gives `view.drag` source "virtual"; pass the pointerdown event for "mouse". `checkDirection` passes on a horizontal listbox.
- **A listbox `filter` that returns a score does not reorder composed parts** (B38): the list slot's `bind` must re-append them. With `items` data, `listbox.shows(part)` no longer filters (use your own `present`), and `move("first")` is the best score only with `items` set. The snapshot leaves out `items` for a long list (16 items, blank query).
- **Set X skips the SDK `SKILL.md` and the Visual step** (X01). The gate prints `snapshot null` and the shell "2 bytes" (snapshot `[]`); both are expected. The test file cannot use `src/testing` keys (it imports `@ui-sdk/web/agent`): write a local `press()` and pass `{ agent: undefined as never, ask }`. jsdom 31.0.1 has no `HTMLDialogElement.showModal`; X01 uses `div[role=alertdialog]`. The `source` stage checks `@ui-sdk/` imports in the UI file only. A layer 2 row in set X needs no `breaks`, `server:` or `direction:` test (`scripts/gate.mjs:17`, `isPrimitive` excludes set X; `:90`) (X02).
- **Typeahead in plain script: `ui/B17-metro-line-map.test.ts` is the only spec** (X03): a repeated letter steps on, Space continues a query. No timeout is documented (X03 uses 700 ms); press `Escape` between tests so a query does not carry over.
- **The source stage reads text: a module-level arrow function that only reads `window.matchMedia` when called is refused** (F01). Put it inside `mount`. The web `valuechange` detail has `source` ("agent" or "keyboard") for input, select, radio and slider, but radio.md and input.md show only `{ value, reason }`. A bridge `setValue` above a slider's max does not change the value.
- **A single-thumb slider needs `aria-label` on both `ui-slider` (bridge label, `query`) and `ui-slider-thumb` (axe)** (F03). Toggle's bridge action is `{ action: "setPressed", args: [true] }`. The snapshot fills 100 controls in document order, then `{ ref: "more", more: N, use: "query" }`. A visually hidden prefix span (`Kick </span>Mute`) makes 70 button labels unique and passes axe.
- **Virtualized combobox** (F02): `combobox.d.ts` types only `defineComboboxElements` (cast `items`, `value`, `api`). The list needs `position: relative`, items `position: absolute`. `web.css:932-956` gives the content its own scroll; set `overflow: visible; max-height: none` with the docs' inner scroller. A refused `setValue` on a `closed: true` list returns `ok: false` (not the A04 fact).
- **Menu `row` text is the `textContent` of the enclosing `li`** (F04); it updates as a `row` change. `createConfirm` called from a menu `action` listener opens in the same step. A refused confirm step leaves the dialog open and the promise pending. A closed alert dialog with no trigger needs a static title and `keep-mounted` content for a bridge label. `justify-self` on `ui-button` has no effect; put it on the inner `button`. A design-stage `cramped-padding` with no element can come from the shell's snapshot box: shorten long labels (about 34 chars, A18).
- **A refusal task** (F07): put the wrong value as the last step (the failed step stops the call) and add `person: "deny"`. `closed: true` with `items: (api) => …` refuses with `No item "47" in … Its items: 38, …`, `error.step` 1. Make the api's `setValue` return false (not throw) for an unknown value, so the break that removes `closed: true` gives `ok: true` and is caught. A label from `aria-labelledby` on an own primitive root reaches the snapshot.
- **`src/setup.ts` stubs `checkVisibility` to `() => true`** (F08), so in jsdom the bridge sees fields in `hidden` panels and a `reveals` error never occurs. To test `reveals`, set it in your test file to `!this.closest("[hidden]")`. The error then reads `No component "X" on the page. Its labels: … It may be behind one of these, which a step can open first: <label> (c1): <items>.` `live()` labels are not in document order: sort them. jsdom has no `Element.animate`: stub it.
- **A `document.modelContext` mock for `registerTools`** (F06): `registerTool(tool, { signal })` must return a Promise (else `reading 'catch'` at core `agent.js:1432`). Cleanup aborts each `signal` and does not call `unregisterTool`: remove the tool on `abort`. `execute` returns the plain bridge result, not MCP `content`. The `allow` of `registerTools` runs only for tool calls, after the shell's `allow`: with `data-agent-confirm` you get 2 prompts. A tool call inside an `action` listener queues behind the outer act; `task.done` sees only its first step. Slider focus target: `[data-slot=slider-thumb-input]`.
- **`agentTools`** (F05): the `.d.ts` has no text; print descriptions and schemas from `@ui-sdk/core/dist/page/agent/agent.js`. Only `act` has `required` (`["steps"]`). A failed `act` result has an `error` key. The design stage flags a zero-offset `text-shadow` as `dark-glow`, not an SVG `feGaussianBlur`. A scroll `<pre>`: make the `<pre>` itself the region (`role="region"`, `tabindex="0"`, `aria-label`), inset `box-shadow`, no background (a wrapping scroll `div` fails axe "partially obscured"). End on a whole line with no bottom padding and `max-height: calc(N lh + top padding)`.
- **`data-agent-confirm` can change at run time** (F12) with `setAttribute`; the next snapshot shows the new text. A person's Enter or Space sends `action` with no prompt: only bridge steps go through `allow`. A select item labeled "3 tickets" takes setValue "3".
- **Label collision** (F10): each `ui-field` takes a ref but is not in the snapshot, so refs skip numbers (select `c2`, input `c4`); print `agent.snapshot()` to find them. A bare "Tip" against "Custom tip" refuses with `"Tip" names 2 components: c2 Tip, c4 Custom tip. Use a ref. …`; "Custom tip" does not collide. A refused step stops the call, so a step by ref must come before it. The task error reaches only the shell's `.g-outcome`, not `task.done`'s root.
- **Secrets** (F13): `autocomplete` `cc-number`, `cc-exp` and `cc-csc` are secret with no mark. The bridge keeps a field secret after you remove `data-agent-secret`. `valuechange` fires on a `setValue` to a secret `ui-input`. A CSS 3D flip card: axe cannot decide contrast under the other face even with `backface-visibility: hidden`; set `visibility: hidden` on the turned-away face (`transition: visibility 0s linear 0.3s`).
- **Hidden** (F14): a `press` on a button inside `data-agent-hidden` returns `ok: false` with "person" in the error and no prompt (use `person: "deny"`). A second mount in one test file needs `await settle()` before `button.click()`.
- **Cancel an agent change** (F15): the `valuechange` detail of `ui-checkbox-group` has `reason`, `event`, `source`, `value`; `detail.cancel` is undefined (checkbox.md says `details.cancel()`). Cancel with `event.preventDefault()` when `detail.source === "agent"`. A canceled step gives `ok: true` with `steps[0].result === false`. A bridge `setValue` on the group passes item labels, not values. An `allow` refusal gives `ok: false`, "The app refused setChecked on c12."
- **`shown`** (F09): a later step in the same `act` can use a component that an earlier step made `shown`; a step on a part not shown gives `ok: false`. A shown own primitive's snapshot entry has `errors`, `text`, `min`, `max`. The error part has no id when a root store subscriber runs: build `aria-describedby` from `${part.id}-error`. With `target: wrappedButton`, a missing part puts `hidden` on the inner `<button>`, not the host: select `host:has(> button[hidden])`. `<label for>` names a `ui-input`.
- **`createHistory`** (F16): a seed change made synchronously in mount is not recorded; seed in `setTimeout(0)` with `withSource("mouse" | "keyboard" | "agent", () => el.api.setValue(v))`. `undoSource`, `seek` and `staged.revert` finish 229 to 297 ms after the act (jsdom): poll in tests, keep them out of the gate task. History records the values that `staged.revert()` puts back as "agent" entries. Refuse undo while a preview is staged (revert restores preview-time values). A switch snapshot entry: read `checked`, not `value` ("on").
- **React adapter** (D01): `@ui-sdk/react/agent` and `@ui-sdk/web/agent` re-export 1 `createAgent`, so the shell bridge sees React parts. The adapter builds ids from `React.useId()`, which repeats across roots: pass `identifierPrefix` to each `createRoot`. Type in a test with the native `value` setter plus an `input` event. React removes an absent part (the web adapter hides it). Use `flushSync` around `root.render` so the markup is there when `mount` returns.
- **Svelte adapter** (D03): after mount the empty part shows under a full list until the first state change (names register after the first render, with no notice to `present`). Render `Picker.Empty` after `onMount`. Part ids are `ui-sdk-c<N>` from a page-global counter, so 2 renderings do not collide. `mount()` then `flushSync()` gives full markup. `createParts` works in `<script module>`. tsc does not type-check `.svelte` files.
- **A `python3 - <<EOF` heredoc can hang a Bash call for 300 s** (B38). Use the Edit tool.
- **The gate prints `ERROR: The process with PID … could not be terminated` while other gates run.** It does not change the result.

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
6. For a row with a `Visual` line: the library items that you imported, and each part of the Visual line that you could not draw, with the reason.
