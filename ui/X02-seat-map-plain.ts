import type { UI } from "../src/ui"

// Comparison build of B01: the same request, written with plain HTML and script. No @ui-sdk import, no task.
const ROWS = 5
const COLS = 8
const TAKEN = ["A4", "A5", "C1", "C2", "D6"]

const seatId = (row: number, col: number) => `${String.fromCharCode(65 + row)}${col + 1}`

const html = `
<h2>Screen 2, 19:30</h2>
<div role="grid" aria-label="Seat map" aria-multiselectable="true" class="x02-map">
  ${Array.from(
    { length: ROWS },
    (_, row) => `<div role="row" class="x02-row">${Array.from({ length: COLS }, (_, col) => {
      const id = seatId(row, col)
      const taken = TAKEN.includes(id)
      return `<div role="gridcell" class="x02-seat" data-seat="${id}" data-row="${row}" data-col="${col}"${
        taken ? ' aria-disabled="true" data-taken' : ' aria-selected="false" tabindex="-1"'
      }>${id}</div>`
    }).join("")}</div>`,
  ).join("")}
</div>
<p data-legend><span data-key="free">Free</span><span data-key="selected">Selected</span><span data-key="taken">Taken</span></p>
<p role="status" data-status>No seat is selected.</p>
<button type="button" class="x02-button" data-book>Book seats</button>`

const css = `
[data-stage] { display: grid; gap: 20px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] .x02-map { display: grid; gap: 8px; }
[data-stage] .x02-row { display: flex; gap: 8px; }
[data-stage] .x02-seat, [data-stage] [data-key] {
  display: grid; place-items: center; width: 44px; height: 40px;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  font-size: 0.8125rem; cursor: pointer; user-select: none;
}
[data-stage] .x02-seat:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] .x02-seat[data-selected], [data-stage] [data-key="selected"] {
  border-color: var(--ui-primary); background: var(--ui-primary); color: var(--ui-primary-foreground); font-weight: 600;
}
[data-stage] .x02-seat[data-taken], [data-stage] [data-key="taken"] {
  border-color: var(--ui-muted); background: var(--ui-muted); color: var(--ui-muted-foreground);
  text-decoration: line-through; cursor: default;
}
[data-stage] [data-legend] { display: flex; gap: 8px; }
[data-stage] [data-key] { width: auto; padding: 0 12px; cursor: default; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
[data-stage] .x02-button { padding: 8px 14px; border: 1px solid var(--ui-input); border-radius: var(--ui-radius); background: var(--ui-background); color: var(--ui-foreground); font: inherit; font-weight: 600; cursor: pointer; }
[data-stage] .x02-button:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const grid = root.querySelector<HTMLElement>('[role="grid"]')!
  const seats = [...root.querySelectorAll<HTMLElement>("[data-seat]")]
  const at = (row: number, col: number) => seats[row * COLS + col]
  const free = (el: HTMLElement | undefined) => !!el && !el.hasAttribute("data-taken")
  const cell = (el: HTMLElement) => ({ row: Number(el.dataset.row), col: Number(el.dataset.col) })
  const selected = new Set<string>()
  const list = () => [...selected].sort().join(", ")
  let active = seats.find(free)!

  const report = () => {
    status.textContent = selected.size ? `Selected: ${list()}.` : "No seat is selected."
  }
  const paint = (el: HTMLElement) => {
    const on = selected.has(el.dataset.seat!)
    el.setAttribute("aria-selected", String(on))
    el.toggleAttribute("data-selected", on)
  }
  const toggle = (el: HTMLElement) => {
    if (!free(el)) return
    const id = el.dataset.seat!
    if (selected.has(id)) selected.delete(id)
    else selected.add(id)
    paint(el)
    report()
  }

  // Roving tabindex: 1 tab stop. A taken seat has no tabindex, so it never gets focus.
  const focusSeat = (el: HTMLElement) => {
    active.tabIndex = -1
    active = el
    el.tabIndex = 0
    el.focus()
  }
  active.tabIndex = 0

  // The next free seat from a seat, step by step in 1 direction. A taken seat is skipped. No wrap.
  const walk = (from: HTMLElement, dRow: number, dCol: number) => {
    let { row, col } = cell(from)
    for (;;) {
      row += dRow
      col += dCol
      if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null
      if (free(at(row, col))) return at(row, col)
    }
  }
  const rowEnd = (from: HTMLElement, last: boolean) => {
    const { row } = cell(from)
    const line = Array.from({ length: COLS }, (_, col) => at(row, col)).filter(free)
    return line[last ? line.length - 1 : 0]
  }

  const rtl = () => (root.closest("[dir]")?.getAttribute("dir") ?? document.documentElement.dir) === "rtl"

  grid.addEventListener("keydown", (event) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>("[data-seat]")
    if (!el || !free(el)) return
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault()
      toggle(el)
      return
    }
    const dir = rtl() ? -1 : 1
    const moves: Record<string, () => HTMLElement | null | undefined> = {
      ArrowRight: () => walk(el, 0, dir),
      ArrowLeft: () => walk(el, 0, -dir),
      ArrowDown: () => walk(el, 1, 0),
      ArrowUp: () => walk(el, -1, 0),
      Home: () => rowEnd(el, false),
      End: () => rowEnd(el, true),
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    const to = move()
    if (!to || to === el) return
    // Shift with an arrow key selects each free seat between the old seat and the new seat, in reading order.
    if (event.shiftKey && event.key.startsWith("Arrow")) {
      const [a, b] = [seats.indexOf(el), seats.indexOf(to)].sort((x, y) => x - y)
      for (const seat of seats.slice(a, b + 1)) {
        if (free(seat) && !selected.has(seat.dataset.seat!)) {
          selected.add(seat.dataset.seat!)
          paint(seat)
        }
      }
      report()
    }
    focusSeat(to)
  })

  grid.addEventListener("click", (event) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>("[data-seat]")
    if (!el || !free(el)) return
    focusSeat(el)
    toggle(el)
  })

  root.querySelector("[data-book]")!.addEventListener("click", () => {
    status.textContent = selected.size ? `Booked: ${list()}.` : "Select a seat first."
  })
}

const ui: UI = {
  id: "X02",
  request: "Build a cinema seat map: arrow keys move between seats, taken seats are skipped, and a person can select more than 1 seat.",
  css,
  mount,
}

export default ui
