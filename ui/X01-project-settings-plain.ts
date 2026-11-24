import type { UI } from "../src/ui"

// Comparison build of A01: the same request, written with plain HTML and script. No @ui-sdk import, no task.
const html = `
<div class="x01-tabs">
  <div role="tablist" aria-label="Settings sections" data-tablist>
    <button type="button" role="tab" id="x01-tab-general" aria-controls="x01-panel-general" aria-selected="true" data-tab="general">General</button>
    <button type="button" role="tab" id="x01-tab-notifications" aria-controls="x01-panel-notifications" aria-selected="false" tabindex="-1" data-tab="notifications">Notifications</button>
    <button type="button" role="tab" id="x01-tab-danger" aria-controls="x01-panel-danger" aria-selected="false" tabindex="-1" data-tab="danger">Danger zone</button>
  </div>
  <div role="tabpanel" id="x01-panel-general" aria-labelledby="x01-tab-general" data-panel="general">
    <div class="x01-field">
      <label for="x01-name">Project name</label>
      <input id="x01-name" name="name" value="Apollo" required aria-describedby="x01-name-error" />
      <p id="x01-name-error" class="x01-error" data-name-error></p>
    </div>
    <div class="x01-field">
      <label for="x01-visibility">Visibility</label>
      <select id="x01-visibility" name="visibility">
        <option value="private">Private</option>
        <option value="internal">Internal</option>
        <option value="public">Public</option>
      </select>
    </div>
    <button type="button" class="x01-button" data-save>Save settings</button>
  </div>
  <div role="tabpanel" id="x01-panel-notifications" aria-labelledby="x01-tab-notifications" data-panel="notifications" hidden>
    <div class="x01-row">
      <button type="button" role="switch" id="x01-digest" class="x01-switch" aria-checked="true" aria-labelledby="x01-digest-label" data-switch="digest"><span></span></button>
      <span id="x01-digest-label">Weekly digest</span>
    </div>
    <div class="x01-row">
      <button type="button" role="switch" id="x01-alerts" class="x01-switch" aria-checked="false" aria-labelledby="x01-alerts-label" data-switch="alerts"><span></span></button>
      <span id="x01-alerts-label">Deploy alerts</span>
    </div>
  </div>
  <div role="tabpanel" id="x01-panel-danger" aria-labelledby="x01-tab-danger" data-panel="danger" hidden>
    <p>A deleted project cannot be restored.</p>
    <button type="button" class="x01-button" data-delete>Delete project</button>
    <div class="x01-backdrop" data-backdrop hidden>
      <div role="alertdialog" aria-modal="true" aria-labelledby="x01-dialog-title" aria-describedby="x01-dialog-text" class="x01-dialog" data-dialog>
        <h2 id="x01-dialog-title">Delete this project?</h2>
        <p id="x01-dialog-text">The project and all its files are deleted for each member.</p>
        <div class="x01-answers">
          <button type="button" class="x01-button" data-cancel>Cancel</button>
          <button type="button" class="x01-button x01-danger" data-confirm>Delete forever</button>
        </div>
      </div>
    </div>
  </div>
</div>
<p role="status" data-status>No change is saved.</p>`

const css = `
[data-stage] { display: grid; gap: 24px; max-width: 520px; }
[data-stage] p { margin: 0; }
[data-stage] [role="tablist"] { display: flex; gap: 4px; border-bottom: 1px solid var(--ui-border); }
[data-stage] [role="tab"] { padding: 8px 12px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--ui-muted-foreground); font: inherit; font-weight: 600; cursor: pointer; }
[data-stage] [role="tab"][aria-selected="true"] { color: var(--ui-foreground); border-bottom-color: var(--ui-foreground); }
[data-stage] [role="tab"]:focus-visible, [data-stage] .x01-button:focus-visible, [data-stage] .x01-switch:focus-visible,
[data-stage] input:focus-visible, [data-stage] select:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] [role="tabpanel"]:not([hidden]) { display: grid; gap: 20px; justify-items: start; padding-top: 20px; }
[data-stage] .x01-field { display: grid; gap: 6px; }
[data-stage] label { font-weight: 600; }
[data-stage] input, [data-stage] select { min-width: 180px; padding: 8px 10px; border: 1px solid var(--ui-input); border-radius: var(--ui-radius); background: var(--ui-background); color: var(--ui-foreground); font: inherit; }
[data-stage] input[aria-invalid="true"] { border-color: var(--ui-destructive); }
[data-stage] .x01-error { min-height: 0; color: var(--ui-destructive); }
[data-stage] .x01-button { padding: 8px 14px; border: 1px solid var(--ui-input); border-radius: var(--ui-radius); background: var(--ui-background); color: var(--ui-foreground); font: inherit; font-weight: 600; cursor: pointer; }
[data-stage] .x01-danger { border-color: var(--ui-destructive); color: var(--ui-destructive); }
[data-stage] .x01-row { display: flex; align-items: center; gap: 12px; }
[data-stage] .x01-switch { position: relative; width: 40px; height: 22px; padding: 0; border: 1px solid var(--ui-input); border-radius: 11px; background: var(--ui-muted); cursor: pointer; }
[data-stage] .x01-switch span { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--ui-muted-foreground); }
[data-stage] .x01-switch[aria-checked="true"] { background: var(--ui-primary); border-color: var(--ui-primary); }
[data-stage] .x01-switch[aria-checked="true"] span { left: 20px; background: var(--ui-primary-foreground); }
[data-stage] .x01-backdrop { position: fixed; inset: 0; z-index: 10; display: grid; place-items: center; background: rgb(15 23 42 / 0.8); }
[data-stage] .x01-backdrop[hidden] { display: none; }
[data-stage] .x01-dialog { display: grid; gap: 12px; max-width: 380px; padding: 20px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-muted); }
[data-stage] .x01-dialog h2 { margin: 0; font-size: 1.125rem; }
[data-stage] .x01-answers { display: flex; justify-content: flex-end; gap: 12px; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const $ = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!
  const status = $("[data-status]")
  const name = $<HTMLInputElement>("#x01-name")
  const visibility = $<HTMLSelectElement>("#x01-visibility")
  const nameError = $("[data-name-error]")
  const tabs = [...root.querySelectorAll<HTMLElement>("[data-tab]")]
  const switches = [...root.querySelectorAll<HTMLElement>("[data-switch]")]
  const backdrop = $("[data-backdrop]")
  const dialog = $("[data-dialog]")
  const trigger = $("[data-delete]")
  const state = { digest: true, alerts: false }

  // Tabs: automatic activation, 1 tab stop (roving tabindex), arrows wrap, Home and End.
  const select = (tab: HTMLElement, focus: boolean) => {
    for (const other of tabs) {
      const on = other === tab
      other.setAttribute("aria-selected", String(on))
      other.tabIndex = on ? 0 : -1
      root.querySelector<HTMLElement>(`[data-panel=${other.dataset.tab}]`)!.hidden = !on
    }
    if (focus) tab.focus()
  }
  for (const tab of tabs) tab.addEventListener("click", () => select(tab, false))
  $("[data-tablist]").addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent).key
    const at = tabs.indexOf(document.activeElement as HTMLElement)
    const go: Record<string, number> = { ArrowRight: (at + 1) % tabs.length, ArrowLeft: (at - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }
    if (at < 0 || !(key in go)) return
    event.preventDefault()
    select(tabs[go[key]], true)
  })

  // Name: required. An empty name shows an error and blocks Save.
  const checkName = () => {
    const bad = name.value.trim() === ""
    name.setAttribute("aria-invalid", String(bad))
    nameError.textContent = bad ? "Enter a project name." : ""
    return !bad
  }
  name.addEventListener("input", checkName)
  name.addEventListener("blur", checkName)

  for (const toggle of switches)
    toggle.addEventListener("click", () => {
      const on = toggle.getAttribute("aria-checked") !== "true"
      toggle.setAttribute("aria-checked", String(on))
      state[toggle.dataset.switch as "digest" | "alerts"] = on
    })

  $("[data-save]").addEventListener("click", () => {
    if (!checkName()) {
      status.textContent = "Not saved: the project name is empty."
      name.focus()
      return
    }
    status.textContent = `Saved: ${name.value}, ${visibility.value}, weekly digest ${state.digest ? "on" : "off"}, deploy alerts ${state.alerts ? "on" : "off"}.`
  })

  // Delete: a modal alert dialog. Cancel and Escape close it, Tab stays inside, focus goes back to the trigger.
  const close = () => {
    backdrop.hidden = true
    trigger.focus()
  }
  trigger.addEventListener("click", () => {
    backdrop.hidden = false
    $("[data-cancel]").focus()
  })
  $("[data-cancel]").addEventListener("click", close)
  $("[data-confirm]").addEventListener("click", () => {
    status.textContent = `Deleted: ${name.value}.`
    close()
  })
  dialog.addEventListener("keydown", (event) => {
    const key = event as KeyboardEvent
    if (key.key === "Escape") return close()
    if (key.key !== "Tab") return
    const stops = [...dialog.querySelectorAll<HTMLElement>("button")]
    const first = stops[0]
    const last = stops[stops.length - 1]
    if (key.shiftKey && document.activeElement === first) (key.preventDefault(), last.focus())
    else if (!key.shiftKey && document.activeElement === last) (key.preventDefault(), first.focus())
  })
}

const ui: UI = {
  id: "X01",
  request: "Build a project settings page with 3 tabs: a name and a visibility, 2 notification switches, and a delete action that asks first.",
  css,
  mount,
}

export default ui
