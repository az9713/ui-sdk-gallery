import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/select"
import { arc, pie } from "d3"
import type { UI } from "../src/ui"

// The bridge gives refs in the order the components register; each ui-field takes one too (c1, c3).
const TIP_REF = "c2"
const CUSTOM_REF = "c4"
const DINERS = [
  { name: "Ana", items: [["Mushroom risotto", 1850], ["Sparkling water", 350]] },
  { name: "Ben", items: [["Ribeye steak", 3200], ["Red wine", 1100]] },
  { name: "Chloe", items: [["Caesar salad", 1400], ["Lemonade", 450]] },
  { name: "Dev", items: [["Margherita pizza", 1600], ["Craft beer", 750]] },
] as const
const OWN = DINERS.map((d) => d.items.reduce((sum, [, cents]) => sum + cents, 0))
const SUBTOTAL = OWN.reduce((a, b) => a + b, 0)
const TAX = Math.round(SUBTOTAL * 0.08)
const START_PERCENT = "18"
const SIZE = 220

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

// Tax follows what each person ordered, the tip is split evenly, and the last person takes the rounding rest.
function split(tip: number) {
  const total = SUBTOTAL + TAX + tip
  const shares = OWN.map((own) => own + Math.round((TAX * own) / SUBTOTAL) + Math.round(tip / OWN.length))
  shares[shares.length - 1] = total - shares.slice(0, -1).reduce((a, b) => a + b, 0)
  return { total, shares }
}

const summary = (tip: number, how: string) => {
  const { total, shares } = split(tip)
  return `Tip ${money(tip)} (${how}). Total ${money(total)}: ${DINERS.map((d, i) => `${d.name} ${money(shares[i]!)}`).join(", ")}.`
}

const lines = DINERS.flatMap((d) =>
  d.items.map(([item, cents]) => `<li><span>${item} <small>${d.name}</small></span><span>${money(cents)}</span></li>`),
).join("")

const html = `
<div class="f10-layout">
  <article class="f10-receipt" aria-labelledby="f10-place">
    <header class="f10-head">
      <h2 id="f10-place">Harbor Lane Bistro</h2>
      <p>Table 12, 4 guests. 21 Nov 2026, 20:41</p>
    </header>
    <ul class="f10-items">${lines}</ul>
    <dl class="f10-sums">
      <div><dt>Subtotal</dt><dd>${money(SUBTOTAL)}</dd></div>
      <div><dt>Tax 8%</dt><dd>${money(TAX)}</dd></div>
      <div><dt>Tip</dt><dd data-tip></dd></div>
      <div class="f10-total"><dt>Total</dt><dd data-total></dd></div>
    </dl>
    <div class="f10-controls">
      <ui-field>
        <ui-field-label>Tip</ui-field-label>
        <ui-select name="tip" default-value="${START_PERCENT}">
          <ui-select-trigger><button><ui-select-value></ui-select-value></button></ui-select-trigger>
          <ui-select-content>
            <ui-select-item value="15">15%</ui-select-item>
            <ui-select-item value="18">18%</ui-select-item>
            <ui-select-item value="20">20%</ui-select-item>
          </ui-select-content>
        </ui-select>
      </ui-field>
      <ui-field>
        <ui-field-label>Custom tip</ui-field-label>
        <ui-input><input name="custom" inputmode="decimal" autocomplete="off" placeholder="0.00" /></ui-input>
      </ui-field>
    </div>
    <p class="f10-note">A custom tip replaces the percent.</p>
  </article>
  <figure class="f10-shares">
    <h2>Each person's share</h2>
    <svg viewBox="${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}" aria-hidden="true" focusable="false"><g data-pie></g></svg>
    <ul class="f10-legend">${DINERS.map(
      (d, i) =>
        `<li data-person="${d.name}"><span class="f10-swatch" data-slice="${i}"></span><span>${d.name}</span><span data-amount></span><span data-part></span></li>`,
    ).join("")}</ul>
  </figure>
</div>
<p role="status" data-status></p>`

const css = `
[data-stage] { display: grid; gap: 20px; max-width: 860px; }
[data-stage] h2, [data-stage] p, [data-stage] figure, [data-stage] ul, [data-stage] dl, [data-stage] dd { margin: 0; padding: 0; }
[data-stage] .f10-layout { display: grid; grid-template-columns: minmax(0, 380px) minmax(0, 1fr); gap: 32px; align-items: start; }
[data-stage] .f10-receipt {
  --ui-background: #fbf8f1; --ui-foreground: #24211c; --ui-muted: #efe9dd; --ui-muted-foreground: #645e55;
  --ui-border: #d9d1c3; --ui-input: #9c9384; --ui-primary: #0f6b63; --ui-primary-foreground: #ffffff;
  --ui-ring: #0f6b63; --ui-ring-border: #0f6b63;
  color-scheme: light;
  display: grid; gap: 16px; padding: 24px 24px 36px;
  background: var(--ui-background); color: var(--ui-foreground); font-family: var(--ui-font-mono);
  border: 1px solid var(--ui-border); border-bottom: 0;
  -webkit-mask: linear-gradient(#000 0 0) top / 100% calc(100% - 10px) no-repeat, conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom / 20px 10px repeat-x;
  mask: linear-gradient(#000 0 0) top / 100% calc(100% - 10px) no-repeat, conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom / 20px 10px repeat-x;
}
[data-stage] .f10-head { display: grid; gap: 4px; justify-items: center; text-align: center; padding-bottom: 14px; border-bottom: 1px dashed var(--ui-input); }
[data-stage] .f10-head h2 { font-size: 1.25rem; font-weight: 700; }
[data-stage] .f10-head p, [data-stage] .f10-note, [data-stage] .f10-items small { color: var(--ui-muted-foreground); font-size: 0.8125rem; }
[data-stage] .f10-items { list-style: none; display: grid; gap: 6px; }
[data-stage] .f10-items li, [data-stage] .f10-sums div { display: flex; justify-content: space-between; gap: 12px; font-variant-numeric: tabular-nums; }
[data-stage] .f10-sums { display: grid; gap: 6px; padding-top: 12px; border-top: 1px dashed var(--ui-input); }
[data-stage] .f10-total { padding-top: 8px; margin-top: 4px; border-top: 1px solid var(--ui-foreground); font-weight: 700; font-size: 1.125rem; }
[data-stage] .f10-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-top: 12px; border-top: 1px dashed var(--ui-input); }
[data-stage] .f10-controls ui-input input, [data-stage] .f10-controls ui-select-trigger button { width: 100%; font-family: var(--ui-font-mono); }
[data-stage] .f10-shares { display: grid; gap: 16px; justify-items: center; padding: 24px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
[data-stage] .f10-shares h2 { justify-self: start; font-size: 1.25rem; font-weight: 600; }
[data-stage] .f10-shares svg { display: block; width: ${SIZE}px; height: ${SIZE}px; }
[data-stage] [data-pie] path { stroke: var(--ui-background); stroke-width: 2; }
[data-stage] [data-slice="0"] { fill: var(--ui-primary); background: var(--ui-primary); }
[data-stage] [data-slice="1"] { fill: color-mix(in oklab, var(--ui-primary) 68%, var(--ui-background)); background: color-mix(in oklab, var(--ui-primary) 68%, var(--ui-background)); }
[data-stage] [data-slice="2"] { fill: color-mix(in oklab, var(--ui-primary) 42%, var(--ui-background)); background: color-mix(in oklab, var(--ui-primary) 42%, var(--ui-background)); }
[data-stage] [data-slice="3"] { fill: color-mix(in oklab, var(--ui-primary) 22%, var(--ui-background)); background: color-mix(in oklab, var(--ui-primary) 22%, var(--ui-background)); }
[data-stage] .f10-legend { list-style: none; display: grid; gap: 8px; width: 100%; max-width: 320px; }
[data-stage] .f10-legend li { display: grid; grid-template-columns: 14px 1fr auto 3.5em; gap: 10px; align-items: center; font-variant-numeric: tabular-nums; }
[data-stage] .f10-swatch { width: 14px; height: 14px; border-radius: 3px; border: 1px solid var(--ui-input); }
[data-stage] [data-part] { text-align: end; color: var(--ui-muted-foreground); }
[data-stage] [data-status] { max-width: 60ch; color: var(--ui-muted-foreground); }
@media (max-width: 760px) { [data-stage] .f10-layout { grid-template-columns: minmax(0, 1fr); } }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const tipLine = root.querySelector("[data-tip]")!
  const totalLine = root.querySelector("[data-total]")!
  const group = root.querySelector<SVGGElement>("[data-pie]")!
  const slices = pie<number>().sort(null).value((v) => v)
  const shape = arc<{ startAngle: number; endAngle: number }>().innerRadius(0).outerRadius(SIZE / 2 - 4)
  let percent = START_PERCENT
  let custom: number | null = null

  const draw = () => {
    const tip = custom ?? Math.round((SUBTOTAL * Number(percent)) / 100)
    const { total, shares } = split(tip)
    tipLine.textContent = custom === null ? `${money(tip)} (${percent}%)` : `${money(tip)} (custom)`
    totalLine.textContent = money(total)
    group.innerHTML = slices(shares)
      .map((s, i) => `<path data-slice="${i}" d="${shape(s)}"/>`)
      .join("")
    root.querySelectorAll("[data-person]").forEach((li, i) => {
      li.querySelector("[data-amount]")!.textContent = money(shares[i]!)
      li.querySelector("[data-part]")!.textContent = `${Math.round((shares[i]! / total) * 100)}%`
    })
    status.textContent = summary(tip, custom === null ? `${percent}%` : "custom")
  }

  root.querySelector("ui-select")!.addEventListener("valuechange", (e) => {
    percent = String((e as CustomEvent<{ value: string }>).detail.value)
    draw()
  })
  root.querySelector("ui-input")!.addEventListener("valuechange", (e) => {
    const text = String((e as CustomEvent<{ value: string }>).detail.value).replace("$", "").trim()
    const amount = Number(text)
    if (text !== "" && (!Number.isFinite(amount) || amount < 0)) {
      status.textContent = "Write the custom tip as an amount, like 12.50."
      return
    }
    custom = text === "" ? null : Math.round(amount * 100)
    draw()
  })
  draw()
}

const ui: UI = {
  id: "F10",
  request:
    "Build a restaurant bill split on receipt paper with a Tip choice, a Custom tip amount and a pie of each person's share, and show what an agent gets when it names the tip by the word Tip.",
  css,
  mount,
  task: {
    // The step by ref runs first: the refused step stops the call, so nothing after it runs.
    steps: [
      { ref: CUSTOM_REF, action: "setValue", args: ["12"] },
      { ref: "Tip", action: "setValue", args: ["20%"] },
    ],
    person: "deny",
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === summary(1200, "custom") &&
      (root.querySelector("ui-select") as HTMLElement & { value?: string }).value === START_PERCENT &&
      new RegExp(`"Tip" names 2 components: ${TIP_REF} Tip, ${CUSTOM_REF} Custom tip`).test(
        root.ownerDocument.querySelector(".g-outcome")?.textContent ?? "",
      ),
  },
}

export default ui
