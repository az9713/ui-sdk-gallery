import "@ui-sdk/web/button"
import "@ui-sdk/web/color-picker"
import "@ui-sdk/web/field"
import "@ui-sdk/web/popover"
import "@ui-sdk/web/segmented-control"
import type { UI } from "../src/ui"

const html = `
<h1 data-title>Brand theme</h1>
<ui-color-picker aria-label="Brand color" default-value="#d9480f" space="hsv" format="hex">
  <div data-row>
    <span data-caption>Brand color</span>
    <ui-popover>
      <ui-popover-trigger>
        <button type="button" aria-label="Pick brand color"><ui-color-picker-swatch></ui-color-picker-swatch></button>
      </ui-popover-trigger>
      <ui-popover-content>
        <ui-popover-title>Pick a brand color</ui-popover-title>
        <ui-color-picker-area>
          <ui-color-picker-area-thumb></ui-color-picker-area-thumb>
        </ui-color-picker-area>
        <ui-color-picker-slider channel="hue">
          <ui-color-picker-slider-thumb></ui-color-picker-slider-thumb>
        </ui-color-picker-slider>
        <ui-color-picker-slider channel="brightness">
          <ui-color-picker-slider-thumb></ui-color-picker-slider-thumb>
        </ui-color-picker-slider>
        <ui-color-picker-input><input aria-label="Hex code" /></ui-color-picker-input>
        <ui-popover-close><button type="button">Done</button></ui-popover-close>
      </ui-popover-content>
    </ui-popover>
    <code data-hex>#d9480f</code>
  </div>
</ui-color-picker>
<ui-field>
  <ui-field-label>Layout mode</ui-field-label>
  <ui-segmented-control default-value="comfortable">
    <ui-segmented-control-indicator></ui-segmented-control-indicator>
    <ui-segmented-control-item value="comfortable">Comfortable</ui-segmented-control-item>
    <ui-segmented-control-item value="compact">Compact</ui-segmented-control-item>
  </ui-segmented-control>
</ui-field>
<div data-preview data-mode="comfortable">
  <span data-preview-title>Preview</span>
  <span data-preview-chip>Brand button</span>
  <span data-preview-line>Spacing follows the layout mode.</span>
</div>
<ui-button data-save><button type="button">Save theme</button></ui-button>
<p role="status" data-status>No theme is saved.</p>`

const css = `
[data-stage] { display: grid; gap: 20px; max-width: 480px; justify-items: start; }
[data-stage] h1 { margin: 0; font-size: 20px; }
[data-stage] p { margin: 0; }
[data-stage] [data-row] { display: flex; align-items: center; gap: 12px; }
[data-stage] [data-caption] { font-weight: 500; }
[data-stage] ui-popover-trigger button { padding: 4px; }
[data-stage] ui-color-picker-swatch { display: block; width: 28px; height: 28px; border-radius: 6px; background: var(--color-picker-color); }
[data-stage] ui-popover-content { display: grid; gap: 12px; padding: 16px; width: 240px; }
[data-stage] ui-color-picker-area { display: block; position: relative; width: 100%; height: 140px; border-radius: 6px; background: var(--color-area-background); }
[data-stage] ui-color-picker-slider { display: block; position: relative; width: 100%; height: 14px; border-radius: 7px; background: var(--color-slider-background); }
[data-stage] [data-preview] { display: grid; gap: 12px; padding: 16px; width: 100%; box-sizing: border-box; border: 1px solid var(--ui-border); border-radius: 8px; }
[data-stage] [data-preview][data-mode="compact"] { gap: 4px; padding: 8px 12px; }
[data-stage] [data-preview-title] { font-weight: 600; }
[data-stage] [data-preview-chip] { justify-self: start; padding: 4px 12px; border-radius: 6px; background: var(--brand, #d9480f); color: #000; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const theme = { color: "#d9480f", mode: "comfortable" }
  const picker = root.querySelector("ui-color-picker")!
  const preview = root.querySelector<HTMLElement>("[data-preview]")!
  const hex = root.querySelector("[data-hex]")!
  const status = root.querySelector("[data-status]")!
  picker.addEventListener("valuechange", (e) => {
    theme.color = (e as CustomEvent).detail.value as string
    hex.textContent = theme.color
    preview.style.setProperty("--brand", theme.color)
  })
  root.querySelector("ui-segmented-control")!.addEventListener("valuechange", (e) => {
    theme.mode = (e as CustomEvent).detail.value as string
    preview.dataset.mode = theme.mode
  })
  root.querySelector("[data-save]")!.addEventListener("action", () => {
    status.textContent = `Saved: ${theme.color}, ${theme.mode} layout.`
  })
}

const ui: UI = {
  id: "A09",
  request: "Build a brand theme editor: a swatch that opens a color picker in a popover, and a switch between comfortable and compact layout.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Brand color", action: "setValue", args: ["#e11d48"] },
      { ref: "Layout mode", action: "setValue", args: ["compact"] },
      { ref: "Save theme", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Saved: #e11d48, compact layout.",
  },
}

export default ui
