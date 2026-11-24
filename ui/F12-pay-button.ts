import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import type { UI } from "../src/ui"

const ROWS = "ABCDEFGH"
const SEATS = 14
const AISLE_AFTER = 7
const PICK_ROW = "F"
const PICK_FROM = 7
const MAX = 4
const PRICE = 4800
const FEE = 450
const START = 2
const CARD = "Visa 4242"
const W = 420
const H = 236

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`
const total = (count: number) => count * (PRICE + FEE)
const seatsText = (count: number) => {
  const numbers = Array.from({ length: count }, (_, i) => PICK_FROM + i)
  if (count === 1) return `seat ${numbers[0]}`
  return `seats ${numbers.slice(0, -1).join(", ")} and ${numbers[count - 1]}`
}
const plural = (count: number) => `${count} ticket${count === 1 ? "" : "s"}`
const chosen = (count: number) => `${plural(count)}: Row ${PICK_ROW}, ${seatsText(count)}. Total ${money(total(count))}. Not paid.`
const paid = (count: number) => `Paid ${money(total(count))} with ${CARD} for ${plural(count)}: Row ${PICK_ROW}, ${seatsText(count)}.`
const confirmText = (count: number) => `Charges ${money(total(count))} to ${CARD}`

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const html = `
<article class="f12-ticket" aria-labelledby="f12-event">
  <section class="f12-main">
    <header class="f12-head">
      <h2 id="f12-event">The Lantern Choir, live</h2>
      <p>Saturday 12 December 2026, doors 19:30. Riverside Hall, Stalls.</p>
    </header>
    <div class="f12-map">
      <p class="f12-stage-label">Stage</p>
      <svg viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false" data-seatmap>
        <path class="f12-stage" d="M60 6 H${W - 60} Q${W - 60} 34 ${W / 2} 38 Q60 34 60 6 Z" />
        <g data-seats></g>
      </svg>
      <ul class="f12-legend">
        <li><span class="f12-key" data-kind="picked"></span>Your seats</li>
        <li><span class="f12-key" data-kind="free"></span>Free</li>
        <li><span class="f12-key" data-kind="taken"></span>Taken</li>
      </ul>
    </div>
    <ui-field class="f12-count">
      <ui-field-label>Tickets</ui-field-label>
      <ui-select name="count" default-value="${START}">
        <ui-select-trigger><button><ui-select-value></ui-select-value></button></ui-select-trigger>
        <ui-select-content>
          ${Array.from({ length: MAX }, (_, i) => `<ui-select-item value="${i + 1}">${plural(i + 1)}</ui-select-item>`).join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
  </section>
  <aside class="f12-stub" aria-label="Ticket stub">
    <p class="f12-admit" data-admit></p>
    <dl>
      <div><dt>Row</dt><dd>${PICK_ROW}</dd></div>
      <div><dt>Seats</dt><dd data-seat-list></dd></div>
      <div><dt>Each</dt><dd>${money(PRICE)} + ${money(FEE)} fee</dd></div>
      <div class="f12-total"><dt>Total</dt><dd data-total></dd></div>
    </dl>
    <ui-button data-pay><button></button></ui-button>
    <p class="f12-card">Card: ${CARD}</p>
  </aside>
</article>
<p role="status" data-status></p>`

const css = `
[data-stage] { display: grid; gap: 20px; max-width: 780px; }
[data-stage] h2, [data-stage] p, [data-stage] ul, [data-stage] dl, [data-stage] dd { margin: 0; padding: 0; }
[data-stage] .f12-ticket {
  --f12-cut: calc(100% - 220px);
  display: grid; grid-template-columns: minmax(0, 1fr) 220px;
  background: var(--ui-background); color: var(--ui-foreground);
  border: 1px solid var(--ui-border); border-radius: var(--ui-radius);
  -webkit-mask: radial-gradient(circle 12px at var(--f12-cut) 0, #0000 97%, #000) top / 100% 51% no-repeat, radial-gradient(circle 12px at var(--f12-cut) 100%, #0000 97%, #000) bottom / 100% 51% no-repeat;
  mask: radial-gradient(circle 12px at var(--f12-cut) 0, #0000 97%, #000) top / 100% 51% no-repeat, radial-gradient(circle 12px at var(--f12-cut) 100%, #0000 97%, #000) bottom / 100% 51% no-repeat;
}
[data-stage] .f12-main { display: grid; gap: 16px; padding: 24px; align-content: start; }
[data-stage] .f12-head { display: grid; gap: 4px; }
[data-stage] .f12-head h2 { font-size: 1.375rem; font-weight: 700; }
[data-stage] .f12-head p, [data-stage] .f12-card, [data-stage] .f12-legend { color: var(--ui-muted-foreground); font-size: 0.875rem; }
[data-stage] .f12-map { display: grid; gap: 6px; justify-items: center; }
[data-stage] .f12-stage-label { font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.08em; color: var(--ui-muted-foreground); }
[data-stage] [data-seatmap] { display: block; width: 100%; max-width: ${W}px; height: auto; }
[data-stage] .f12-stage { fill: var(--ui-muted); stroke: var(--ui-input); }
[data-stage] [data-seats] rect { rx: 4px; stroke-width: 1.5; }
[data-stage] [data-seats] [data-kind="free"], [data-stage] .f12-key[data-kind="free"] { fill: var(--ui-background); stroke: var(--ui-input); background: var(--ui-background); border-color: var(--ui-input); }
[data-stage] [data-seats] [data-kind="taken"], [data-stage] .f12-key[data-kind="taken"] { fill: var(--ui-muted); stroke: var(--ui-muted); background: var(--ui-muted); border-color: var(--ui-border); }
[data-stage] [data-seats] [data-kind="picked"], [data-stage] .f12-key[data-kind="picked"] { fill: var(--ui-primary); stroke: var(--ui-primary); background: var(--ui-primary); border-color: var(--ui-primary); }
[data-stage] .f12-legend { list-style: none; display: flex; gap: 16px; }
[data-stage] .f12-legend li { display: flex; gap: 6px; align-items: center; }
[data-stage] .f12-key { width: 14px; height: 12px; border-radius: 3px; border: 1px solid; }
[data-stage] .f12-count { max-width: 200px; }
[data-stage] .f12-count ui-select-trigger button { width: 100%; }
[data-stage] .f12-stub {
  display: grid; gap: 14px; align-content: start; padding: 24px 20px;
  border-inline-start: 2px dashed var(--ui-input);
  font-family: var(--ui-font-mono); font-variant-numeric: tabular-nums;
}
[data-stage] .f12-admit { font-size: 1.125rem; font-weight: 700; }
[data-stage] .f12-stub dl { display: grid; gap: 8px; }
[data-stage] .f12-stub dl div { display: grid; gap: 2px; }
[data-stage] .f12-stub dt { font-size: 0.75rem; color: var(--ui-muted-foreground); }
[data-stage] .f12-total dd { font-size: 1.125rem; font-weight: 700; }
[data-stage] [data-pay] button { width: 100%; }
[data-stage] [data-status] { max-width: 60ch; color: var(--ui-muted-foreground); }
@media (max-width: 640px) {
  [data-stage] .f12-ticket { grid-template-columns: minmax(0, 1fr); -webkit-mask: none; mask: none; }
  [data-stage] .f12-stub { border-inline-start: 0; border-top: 2px dashed var(--ui-input); }
}
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const pay = root.querySelector<HTMLElement>("[data-pay]")!
  const payText = pay.querySelector("button")!
  const group = root.querySelector("[data-seats]")!
  const random = seeded(1212)
  const taken = new Set<string>()
  for (const row of ROWS)
    for (let n = 1; n <= SEATS; n++) {
      const ours = row === PICK_ROW && n >= PICK_FROM && n < PICK_FROM + MAX
      if (!ours && random() < 0.42) taken.add(`${row}${n}`)
    }
  let count = START

  const draw = () => {
    const cells: string[] = []
    ROWS.split("").forEach((row, r) => {
      for (let n = 1; n <= SEATS; n++) {
        const id = `${row}${n}`
        const kind = row === PICK_ROW && n >= PICK_FROM && n < PICK_FROM + count ? "picked" : taken.has(id) ? "taken" : "free"
        const x = 22 + (n - 1) * 26 + (n > AISLE_AFTER ? 16 : 0)
        const y = 62 + r * 21
        cells.push(`<rect data-seat="${id}" data-kind="${kind}" x="${x}" y="${y}" width="18" height="15" />`)
      }
    })
    group.innerHTML = cells.join("")
    root.querySelector("[data-admit]")!.textContent = `Admit ${count}`
    root.querySelector("[data-seat-list]")!.textContent = Array.from({ length: count }, (_, i) => PICK_FROM + i).join(", ")
    root.querySelector("[data-total]")!.textContent = money(total(count))
    payText.textContent = `Pay ${money(total(count))}`
    pay.setAttribute("data-agent-confirm", confirmText(count))
  }

  root.querySelector("ui-select")!.addEventListener("valuechange", (e) => {
    count = Number((e as CustomEvent<{ value: string }>).detail.value)
    draw()
    status.textContent = chosen(count)
  })
  pay.addEventListener("action", () => {
    status.textContent = paid(count)
  })
  draw()
  status.textContent = chosen(count)
}

const ui: UI = {
  id: "F12",
  request:
    "Build a concert ticket checkout as a ticket stub with a seat block under the stage, a Tickets count and a Pay button that an agent may press only after the person allows it on the page.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Tickets", action: "setValue", args: ["3"] },
      { ref: "Pay", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === paid(3),
  },
}

export default ui
