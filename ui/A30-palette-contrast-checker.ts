import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/select"
import { contrastRatio, convertColor, formatColor, mixColor, parseColor } from "@ui-sdk/core/color"
import type { Color, ColorFormat } from "@ui-sdk/core/color"
import type { UI } from "../src/ui"

const formats: { value: ColorFormat; label: string }[] = [
  { value: "hex", label: "Hex" },
  { value: "srgb", label: "RGB" },
  { value: "oklch", label: "OKLCH" },
  { value: "display-p3", label: "Display P3" },
]

const levels = [
  { name: "Normal text, AA", need: 4.5 },
  { name: "Normal text, AAA", need: 7 },
  { name: "Large text, AA", need: 3 },
  { name: "Large text, AAA", need: 4.5 },
]

const html = `
<section data-controls>
  <div data-pair>
    <ui-field>
      <ui-field-label>Text color</ui-field-label>
      <ui-input><input value="#1d4ed8" spellcheck="false" /></ui-input>
      <ui-field-description>Any CSS color, like #1d4ed8 or oklch(0.5 0.2 260).</ui-field-description>
    </ui-field>
    <ui-field>
      <ui-field-label>Background color</ui-field-label>
      <ui-input><input value="#ffffff" spellcheck="false" /></ui-input>
      <ui-field-description>An opaque CSS color.</ui-field-description>
    </ui-field>
  </div>
  <ui-field>
    <ui-field-label>Show colors as</ui-field-label>
    <ui-select name="format" default-value="hex">
      <ui-select-trigger><button><ui-select-value></ui-select-value></button></ui-select-trigger>
      <ui-select-content>
        ${formats.map((f) => `<ui-select-item value="${f.value}">${f.label}</ui-select-item>`).join("")}
      </ui-select-content>
    </ui-select>
  </ui-field>
  <div data-actions>
    <ui-button data-check><button>Check contrast</button></ui-button>
    <ui-button data-swap><button>Swap colors</button></ui-button>
  </div>
</section>
<div data-sample role="group" aria-label="Sample of the pair">
  <p data-normal>Normal text, 16 px: the quick brown fox.</p>
  <p data-large>Large text, 24 px</p>
</div>
<section data-results>
  <h2>Results</h2>
  <ul aria-label="Colors as read" data-colors></ul>
  <ul aria-label="WCAG levels" data-levels></ul>
</section>
<p role="status" data-status></p>`

const css = `
[data-stage] { display: grid; gap: 24px; max-width: 560px; }
[data-stage] [data-controls] { display: grid; gap: 20px; }
[data-stage] [data-pair] { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
[data-stage] [data-actions] { display: flex; gap: 12px; }
[data-stage] [data-sample] { --sample-fg: #1d4ed8; --sample-bg: #ffffff; color: var(--sample-fg); background: var(--sample-bg); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); padding: 16px 20px; display: grid; gap: 8px; }
[data-stage] [data-sample] p { margin: 0; }
[data-stage] [data-large] { font-size: 24px; font-weight: 600; line-height: 1.3; }
[data-stage] [data-results] h2 { margin: 0 0 8px; font-size: 18px; }
[data-stage] [data-results] ul { list-style: none; margin: 0 0 12px; padding: 0; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
[data-stage] [data-results] ul:empty { display: none; }
[data-stage] [data-results] li { display: flex; justify-content: space-between; gap: 16px; padding: 8px 14px; font-variant-numeric: tabular-nums; }
[data-stage] [data-results] li + li { border-top: 1px solid var(--ui-border); }
[data-stage] [data-results] [data-pass] { font-weight: 600; }
[data-stage] [data-results] [data-pass="false"] { color: var(--ui-destructive); }
[data-stage] [data-status] { margin: 0; color: var(--ui-foreground); }
`

type InputElement = HTMLElement & { api: { setValue(value: string): boolean } }

function mount(root: HTMLElement) {
  root.innerHTML = html
  const [textBox, backBox] = [...root.querySelectorAll<InputElement>("ui-input")]
  const field = (box: InputElement) => box.querySelector("input")!
  const sample = root.querySelector<HTMLElement>("[data-sample]")!
  const colorsList = root.querySelector("[data-colors]")!
  const levelsList = root.querySelector("[data-levels]")!
  const status = root.querySelector("[data-status]")!
  const state = { format: "hex" as ColorFormat }

  const row = (label: string, value: string, pass?: boolean) => {
    const li = document.createElement("li")
    const name = document.createElement("span")
    const result = document.createElement("span")
    name.textContent = label
    result.textContent = value
    if (pass !== undefined) result.dataset.pass = String(pass)
    li.append(name, result)
    return li
  }

  const lightness = (color: Color) => convertColor(color, "oklch").coords[0]!.toFixed(2)

  const check = () => {
    const text = parseColor(field(textBox).value.trim())
    const back = parseColor(field(backBox).value.trim())
    colorsList.replaceChildren()
    levelsList.replaceChildren()
    if (!text) return void (status.textContent = `Cannot read "${field(textBox).value.trim()}" as a text color.`)
    if (!back) return void (status.textContent = `Cannot read "${field(backBox).value.trim()}" as a background color.`)
    if (back.alpha < 1) return void (status.textContent = "The background color must be opaque. Remove its alpha.")

    // contrastRatio ignores alpha: blend a translucent text color over the background first.
    const seen = text.alpha < 1 ? mixColor({ ...back, alpha: 1 }, { ...text, alpha: 1 }, text.alpha, { space: "srgb" }) : text
    // WCAG does not round up: 4.499 is not 4.5. The 1e-9 absorbs float error, which gives black on white 20.999999999999996.
    const ratio = contrastRatio(seen, back) + 1e-9
    const shown = (Math.floor(ratio * 100) / 100).toFixed(2)

    sample.style.setProperty("--sample-fg", formatColor(seen, "hex"))
    sample.style.setProperty("--sample-bg", formatColor(back, "hex"))
    colorsList.append(
      row(text.alpha < 1 ? "Text color over the background" : "Text color", formatColor(seen, state.format)),
      row("Background color", formatColor(back, state.format)),
      row("Lightness, text and background (OKLCH)", `${lightness(seen)} and ${lightness(back)}`),
    )
    const passes = levels.map((level) => ratio >= level.need)
    levelsList.append(
      row("Contrast ratio", `${shown}:1`),
      ...levels.map((level, i) => row(`${level.name} (${level.need}:1)`, passes[i] ? "Pass" : "Fail", passes[i])),
    )
    const word = (pass: boolean) => (pass ? "pass" : "fail")
    status.textContent = `Contrast ${shown}:1. Normal text: AA ${word(passes[0]!)}, AAA ${word(passes[1]!)}. Large text: AA ${word(passes[2]!)}, AAA ${word(passes[3]!)}.`
  }

  root.querySelector("[data-check]")!.addEventListener("action", check)
  root.querySelector("[data-swap]")!.addEventListener("action", () => {
    const [text, back] = [field(textBox).value, field(backBox).value]
    textBox.api.setValue(back)
    backBox.api.setValue(text)
    check()
  })
  root.querySelector("ui-select")!.addEventListener("valuechange", (e) => {
    state.format = (e as CustomEvent).detail.value
    check()
  })
  check()
}

const ui: UI = {
  id: "A30",
  request: "Build a palette contrast checker: a text color and a background color that take any CSS color, a sample of the pair, the WCAG 2 contrast ratio with pass or fail for AA and AAA, and a choice of hex, RGB, OKLCH or Display P3 for the color readout.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Text color", action: "setValue", args: ["#9ca3af"] },
      { ref: "Show colors as", action: "setValue", args: ["OKLCH"] },
      { ref: "Check contrast", action: "press" },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Contrast 2.53:1. Normal text: AA fail, AAA fail. Large text: AA fail, AAA fail." &&
      root.querySelector("[data-colors] li")!.textContent === "Text coloroklch(0.7137 0.0192 261.32)",
  },
}

export default ui
