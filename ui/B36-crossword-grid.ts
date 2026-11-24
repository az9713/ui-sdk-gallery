import {
  type ChangeDetails,
  createChange,
  createGridFocus,
  definePrimitive,
  type GridCell,
  keepFocus,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import type { UI } from "../src/ui"

type Letters = Record<string, string>
type Reason = "input" | "list-navigation" | "item-press" | "shortcut" | "imperative"
type Options = {
  defaultValue?: Letters
  onValueChange?: (value: Letters, details: ChangeDetails<Reason>) => void
  onTurnedChange?: (value: boolean, details: ChangeDetails<Reason>) => void
  onWordChange?: (value: string, details: ChangeDetails<Reason>) => void
}
// across is the direction that typing follows; word is the label of the word that holds the active square.
type State = { active: GridCell | null; value: Letters; turned: boolean; across: boolean; word: string }
type Word = { label: string; across: boolean; cells: string[]; answer: string }

const SOLUTION = ["SEA##", "PALM#", "ACTOR", "#HERO", "##RED"]
const SIZE = SOLUTION.length
const CLUES: Record<string, string> = {
  SEA: "Where the tide comes in",
  PALM: "Tree on a desert island",
  ACTOR: "One who plays a part",
  HERO: "Rescuer in a headline",
  RED: "Ink for a loss",
  SPA: "Place for a mud bath",
  EACH: "Apiece",
  ALTER: "Change, as a hem",
  MORE: "Not less",
  ROD: "Fishing pole",
}

// A square's id is its place in the grid as printed, so it stays the same when the grid turns.
const idOf = (row: number, col: number, turned: boolean) => (turned ? `r${col}c${row}` : `r${row}c${col}`)
const cellOf = (id: string, turned: boolean): GridCell =>
  turned ? { row: Number(id[3]), col: Number(id[1]) } : { row: Number(id[1]), col: Number(id[3]) }
const solutionOf = (id: string) => SOLUTION[Number(id[1])][Number(id[3])]
const isBlock = (id: string) => solutionOf(id) === "#"
const white = (row: number, col: number, turned: boolean) =>
  row >= 0 && col >= 0 && row < SIZE && col < SIZE && !isBlock(idOf(row, col, turned))

function wordsOf(turned: boolean): Word[] {
  const list: Word[] = []
  let number = 0
  for (let row = 0; row < SIZE; row++)
    for (let col = 0; col < SIZE; col++) {
      if (!white(row, col, turned)) continue
      const starts = [true, false].filter((across) => {
        const [dr, dc] = across ? [0, 1] : [1, 0]
        return !white(row - dr, col - dc, turned) && white(row + dr, col + dc, turned)
      })
      if (!starts.length) continue
      number++
      for (const across of starts) {
        const [dr, dc] = across ? [0, 1] : [1, 0]
        const cells: string[] = []
        for (let r = row, c = col; white(r, c, turned); r += dr, c += dc) cells.push(idOf(r, c, turned))
        list.push({ label: `${number} ${across ? "Across" : "Down"}`, across, cells, answer: cells.map(solutionOf).join("") })
      }
    }
  return list
}
const WORDS = [wordsOf(false), wordsOf(true)]
const wordsFor = (turned: boolean) => WORDS[turned ? 1 : 0]
const SQUARES = WORDS[0].flatMap((word) => word.cells).filter((id, i, all) => all.indexOf(id) === i)

const rowsHtml = (turned: boolean, letters: Letters) => {
  const numbers = new Map(wordsFor(turned).map((word) => [word.cells[0], word.label.split(" ")[0]]))
  return Array.from(
    { length: SIZE },
    (_, row) =>
      `<b36-row>${Array.from({ length: SIZE }, (_, col) => {
        const id = idOf(row, col, turned)
        const number = numbers.get(id)
        const inner = isBlock(id) ? "" : `${number ? `<small>${number}</small> ` : ""}<span data-letter>${letters[id] ?? ""}</span>`
        return `<b36-cell value="${id}" row="${row}" col="${col}">${inner}</b36-cell>`
      }).join("")}</b36-row>`,
  ).join("")
}

const crossword = definePrimitive({
  name: "crossword",
  options: { defaultValue: "value", onValueChange: "callback", onTurnedChange: "callback", onWordChange: "callback" },
  controlled: ["turned", "word"],
  state: (options: Options): State => ({
    active: null,
    value: options.defaultValue ?? {},
    turned: false,
    across: true,
    word: "1 Across",
  }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const wordAt = (state: State, id: string) => {
      const list = wordsFor(state.turned)
      return list.find((word) => word.across === state.across && word.cells.includes(id)) ?? list.find((word) => word.cells.includes(id))
    }
    // Before the grid is entered, the first square holds the tab stop, so its word is the current one.
    const activeId = (state: State) => (state.active ? idOf(state.active.row, state.active.col, state.turned) : SQUARES[0])
    const setWord = (details: { reason: Reason; event?: Event }) => {
      const state = store.get()
      const word = wordAt(state, activeId(state))?.label ?? ""
      if (word !== state.word) change("word", word, details)
    }
    const grid = createGridFocus(context, {
      key: "active",
      rows: () => SIZE,
      cols: () => SIZE,
      disabled: (cell) => isBlock(idOf(cell.row, cell.col, store.get().turned)),
      onMove: (_cell, { reason, event }) => setWord({ reason, event }),
    })
    const write = (id: string, letter: string, event?: Event) =>
      change("value", { ...store.get().value, [id]: letter }, { reason: event ? "input" : "imperative", event })
    const step = (id: string, by: 1 | -1, event: Event) => {
      const state = store.get()
      const word = wordAt(state, id)
      const next = word?.cells[word.cells.indexOf(id) + by]
      if (next) grid.focus(cellOf(next, state.turned), { reason: "list-navigation", event })
      return next
    }
    const turn = (event?: Event) => {
      const { active, turned, across } = store.get()
      // The square that has focus leads, also when a script focused it and the grid did not.
      const focused = SQUARES.find((id) => {
        const el = context.element("cell", id)
        return !!el && el.ownerDocument.activeElement === el
      })
      const from = focused ? cellOf(focused, turned) : active
      const reason = event ? "shortcut" : "imperative"
      if (!change("turned", !turned, { reason, event })) return false
      store.set({ active: from && { row: from.col, col: from.row }, across: !across })
      setWord({ reason, event })
      if (focused) keepFocus(() => context.element("cell", focused))
      return true
    }
    return {
      grid,
      turn,
      word: (state: State) => wordAt(state, activeId(state))?.cells ?? [],
      clues: () => wordsFor(store.get().turned).map((word) => ({ value: word.label, label: word.label })),
      keydown: (event: KeyboardEvent, id: string) => {
        if (event.altKey && !event.ctrlKey && !event.metaKey && (event.code === "KeyT" || event.key.toLowerCase() === "t")) {
          event.preventDefault()
          turn(event)
        } else if (!event.ctrlKey && !event.metaKey && !event.altKey && /^[a-z]$/i.test(event.key)) {
          event.preventDefault()
          write(id, event.key.toUpperCase(), event)
          step(id, 1, event)
        } else if (event.key === "Backspace") {
          event.preventDefault()
          if (store.get().value[id]) write(id, "", event)
          else {
            const back = step(id, -1, event)
            if (back) write(back, "", event)
          }
        } else if (event.key === "Delete") {
          event.preventDefault()
          write(id, "", event)
        } else if (event.key === " ") {
          event.preventDefault()
          store.set({ across: !store.get().across })
          setWord({ reason: "input", event })
        } else grid.keydown(event)
      },
      fill: (clue: string, answer: string) => {
        const state = store.get()
        const list = wordsFor(state.turned)
        const named = /^(\d+)\s*-?\s*(a|across|d|down)$/i.exec(String(clue).trim())
        const label = named ? `${named[1]} ${named[2][0].toLowerCase() === "a" ? "Across" : "Down"}` : ""
        const word = list.find((item) => item.label === label)
        if (!word) throw new Error(`No clue "${clue}". Clues: ${list.map((item) => item.label).join(", ")}.`)
        const letters = String(answer).toUpperCase().replace(/\s/g, "")
        if (!/^[A-Z]+$/.test(letters) || letters.length !== word.cells.length)
          throw new Error(`${word.label} takes ${word.cells.length} letters from A to Z, and "${answer}" does not fit.`)
        const filled = Object.fromEntries(word.cells.map((id, i) => [id, letters[i]]))
        return change("value", { ...state.value, ...filled }, { reason: "imperative" })
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "grid",
      keys: { none: "Each square handles the arrow keys." },
      // A custom element keeps its markup, so the root draws the squares again in their new places when the grid turns.
      bind: (el, { store }) => {
        let turned = store.get().turned
        const draw = () => {
          const state = store.get()
          if (state.turned !== turned) {
            turned = state.turned
            el.innerHTML = rowsHtml(turned, state.value)
          }
          for (const letter of el.querySelectorAll<HTMLElement>("[data-letter]")) {
            const text = state.value[letter.parentElement!.getAttribute("value")!] ?? ""
            if (letter.textContent !== text) letter.textContent = text
          }
        }
        draw()
        return store.subscribe(draw)
      },
    }),
    row: slot({ role: "row" }),
    cell: slot<GridCell & { value: string }>({
      role: "gridcell",
      focus: "roving",
      props: { value: "string", row: "number", col: "number" },
      attrs: (state, { key, props, api }) => {
        const block = isBlock(key)
        return {
          // A black square has no tabindex, so a click does not focus it.
          tabindex: block ? undefined : api.grid.tabIndex(state, props),
          "aria-disabled": block ? "true" : undefined,
          "data-block": block ? "" : undefined,
          "data-word": !block && api.word(state).includes(key) ? "" : undefined,
          "data-active": api.grid.isActive(state, props) ? "" : undefined,
        }
      },
      press: { none: "A square takes letters from the keyboard, and pointerdown focuses it." },
      on: {
        keydown: (event, { api, key }) => api.keydown(event, key),
        pointerdown: (event, { api, key, props }) => {
          if (!isBlock(key)) api.grid.focus(props, { reason: "item-press", event })
        },
      },
      bind: (el, { api, props }) => api.grid.bind(el, props),
    }),
  }),
  agent: { actions: ["fill", "turn"], items: (api) => api.clues() },
})

const START: Letters = { r0c0: "S", r0c1: "E", r0c2: "A", r1c2: "L", r2c2: "T", r3c2: "E", r4c2: "R", r2c4: "R", r3c4: "O", r4c4: "D" }

createParts(crossword, {
  root: { tag: "b36-crossword", display: "block", api: ["turn", "fill"], options: () => ({ defaultValue: START }) },
  row: "b36-row",
  cell: "b36-cell",
})

const cluesHtml = (turned: boolean, across: boolean) =>
  wordsFor(turned)
    .filter((word) => word.across === across)
    .map((word) => `<li data-word-label="${word.label}"><b>${word.label.split(" ")[0]}</b> ${CLUES[word.answer]}</li>`)
    .join("")

const clueLine = (label: string, turned: boolean) => {
  const word = wordsFor(turned).find((item) => item.label === label)
  return word ? `<b>${label}</b> ${CLUES[word.answer]}` : ""
}

const countLine = (letters: Letters) => {
  const filled = SQUARES.filter((id) => letters[id]).length
  if (SQUARES.every((id) => letters[id] === solutionOf(id))) return "Solved: every answer is right."
  return `${filled} of ${SQUARES.length} squares filled.`
}

const html = `
<article data-paper>
  <header data-masthead>
    <h2>The Morning Ledger</h2>
    <p data-dateline>Daily crossword, Tuesday 24 November 2026, puzzle 312</p>
  </header>
  <div data-layout>
    <div data-board>
      <p data-clue>${clueLine("1 Across", false)}</p>
      <b36-crossword aria-label="Crossword" aria-describedby="b36-keys">${rowsHtml(false, START)}</b36-crossword>
      <ui-button data-turn><button>Turn grid</button></ui-button>
    </div>
    <div data-clues>
      <section><h3>Across</h3><ol data-list="across">${cluesHtml(false, true)}</ol></section>
      <section><h3>Down</h3><ol data-list="down">${cluesHtml(false, false)}</ol></section>
    </div>
  </div>
  <p id="b36-keys" data-hint>Type a letter to fill a square, and focus goes to the next square of the word. Space switches between Across and Down, and Backspace clears. Alt+T, or Turn grid, turns the grid on its diagonal: the Down answers then read across, and focus stays on your square.</p>
  <p role="status" data-status>${countLine(START)}</p>
</article>`

const css = `
[data-stage] { display: grid; justify-items: start; }
[data-stage] [data-paper] {
  --ink: #161616; --paper: #f5f1e6; --shade: #e2dccb; --mark: #f3d36a; --soft: #3d3a33;
  display: grid; gap: 20px; max-width: 780px; padding: 24px 28px 28px;
  border: 1px solid #c9c1ad; background: var(--paper); color: var(--ink);
  font-family: Georgia, "Times New Roman", Times, serif;
}
[data-stage] [data-paper] h2, [data-stage] [data-paper] h3, [data-stage] [data-paper] p, [data-stage] [data-paper] ol { margin: 0; }
[data-stage] [data-masthead] { display: grid; gap: 6px; padding: 10px 0 8px; border-top: 4px double var(--ink); border-bottom: 1px solid var(--ink); text-align: center; }
[data-stage] [data-masthead] h2 { font-size: 2rem; font-weight: 700; letter-spacing: 0.02em; }
[data-stage] [data-dateline] { font-style: italic; font-size: 0.9375rem; color: var(--soft); }
[data-stage] [data-layout] { display: flex; flex-wrap: wrap; gap: 28px; align-items: start; }
[data-stage] [data-board] { display: grid; gap: 12px; justify-items: start; }
[data-stage] [data-clue] { box-sizing: border-box; width: 100%; min-height: 2.75rem; padding: 10px 12px; border: 1px solid var(--ink); font-size: 1rem; }
[data-stage] [data-clue] b { margin-inline-end: 6px; }
[data-stage] b36-crossword { display: grid; gap: 1px; padding: 1px; border: 2px solid var(--ink); background: var(--ink); }
[data-stage] b36-row { display: flex; gap: 1px; }
[data-stage] b36-cell {
  position: relative; display: grid; place-items: center; box-sizing: border-box; width: 60px; height: 60px;
  background: var(--paper); color: var(--ink); cursor: pointer; user-select: none;
}
[data-stage] b36-cell small { position: absolute; top: 3px; inset-inline-start: 5px; font-size: 0.75rem; line-height: 1; }
[data-stage] b36-cell [data-letter] { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 1.875rem; font-weight: 600; }
[data-stage] b36-cell[data-word] { background: var(--shade); }
[data-stage] b36-cell[data-active] { background: var(--mark); }
[data-stage] b36-cell[data-block] { background: var(--ink); cursor: default; }
[data-stage] b36-cell:focus-visible { outline: 3px solid #1d4ed8; outline-offset: -3px; }
[data-stage] [data-turn] button {
  padding: 8px 16px; border: 1px solid var(--ink); border-radius: 2px; background: var(--paper); color: var(--ink);
  font-family: inherit; font-size: 0.9375rem; cursor: pointer;
}
[data-stage] [data-turn] button:hover { background: var(--shade); }
[data-stage] [data-turn] button:focus-visible { outline: 3px solid #1d4ed8; outline-offset: 2px; }
[data-stage] [data-clues] { flex: 1 1 340px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
[data-stage] [data-clues] h3 { padding-bottom: 4px; border-bottom: 1px solid var(--ink); font-size: 1.125rem; font-weight: 700; }
[data-stage] [data-clues] ol { display: grid; gap: 2px; padding: 8px 0 0; list-style: none; font-size: 0.9375rem; line-height: 1.35; }
[data-stage] [data-clues] li { padding: 5px 8px; }
[data-stage] [data-clues] li b { margin-inline-end: 4px; }
[data-stage] [data-clues] li[data-current] { background: var(--shade); }
[data-stage] [data-hint] { max-width: 60ch; color: var(--soft); font-size: 0.875rem; line-height: 1.45; }
[data-stage] [data-status] { font-style: italic; }
`

type CrosswordElement = HTMLElement & { api: { turn: () => boolean } }

function mount(root: HTMLElement) {
  root.innerHTML = html
  const grid = root.querySelector<CrosswordElement>("b36-crossword")!
  const status = root.querySelector("[data-status]")!
  const clue = root.querySelector("[data-clue]")!
  const across = root.querySelector("[data-list=across]")!
  const down = root.querySelector("[data-list=down]")!
  let turned = false
  const mark = (label: string) => {
    clue.innerHTML = clueLine(label, turned)
    for (const item of root.querySelectorAll<HTMLElement>("[data-word-label]"))
      item.toggleAttribute("data-current", item.dataset.wordLabel === label)
  }
  mark("1 Across")
  grid.addEventListener("valuechange", (event) => {
    status.textContent = countLine((event as CustomEvent<{ value: Letters }>).detail.value)
  })
  grid.addEventListener("turnedchange", (event) => {
    turned = (event as CustomEvent<{ value: boolean }>).detail.value
    across.innerHTML = cluesHtml(turned, true)
    down.innerHTML = cluesHtml(turned, false)
    status.textContent = turned
      ? "Turned the grid: the Down answers now read across."
      : "Turned the grid back: the Across answers read across again."
  })
  grid.addEventListener("wordchange", (event) => mark((event as CustomEvent<{ value: string }>).detail.value))
  root.querySelector("[data-turn]")!.addEventListener("action", () => grid.api.turn())
}

const ui: UI = {
  id: "B36",
  request:
    "Build a daily crossword grid where typing fills squares and moves along the word, and turning the grid on its diagonal keeps focus on the square the person was on.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Crossword", action: "fill", args: ["4 Across", "PALM"] },
      { ref: "Crossword", action: "turn" },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Turned the grid: the Down answers now read across." &&
      [...root.querySelectorAll('b36-cell[col="1"] [data-letter]')].map((letter) => letter.textContent).join("") === "PALM",
  },
  breaks: [
    {
      broke: "Focus falls to the page when the grid turns.",
      find: 'if (focused) keepFocus(() => context.element("cell", focused))',
      replace: "",
      caught: "keyboard: on the page, Alt+T turns the grid, focus stays on the same square, and typing goes on down the turned word",
    },
    {
      broke: "The tab stop stays at the old place when the grid turns.",
      find: "store.set({ active: from && { row: from.col, col: from.row }, across: !across })",
      replace: "store.set({ across: !across })",
      caught: "keyboard: Turn grid keeps focus on the button and moves the tab stop with the square",
    },
    {
      broke: "The page does not draw the squares in their new places.",
      find: "el.innerHTML = rowsHtml(turned, state.value)",
      replace: "",
      caught: "keyboard: on the page, Alt+T turns the grid, focus stays on the same square, and typing goes on down the turned word",
    },
    {
      broke: "Black squares take focus.",
      find: "disabled: (cell) => isBlock(idOf(cell.row, cell.col, store.get().turned)),",
      replace: "",
      caught: "keyboard: the grid is 1 tab stop, and the arrow keys move in 2 dimensions past black squares",
    },
    {
      broke: "A click focuses a black square.",
      find: "tabindex: block ? undefined : api.grid.tabIndex(state, props),",
      replace: "tabindex: api.grid.tabIndex(state, props),",
      caught: "pointer: a click focuses a white square and makes its word current, and a black square takes no focus",
    },
    {
      broke: "Typing no longer moves to the next square of the word.",
      find: "step(id, 1, event)",
      replace: "",
      caught: "keyboard: a letter fills the square and focus goes on along the word, and Space switches to Down",
    },
    {
      broke: "Space no longer switches between Across and Down.",
      find: "store.set({ across: !store.get().across })",
      replace: "",
      caught: "keyboard: a letter fills the square and focus goes on along the word, and Space switches to Down",
    },
    {
      broke: "fill takes an answer of the wrong length.",
      find: "letters.length !== word.cells.length)",
      replace: "false)",
      caught: "agent: an agent fills a word and turns the grid while a person is on a square, and gets errors it can act on",
    },
  ],
}

export { crossword, rowsHtml }
export default ui
