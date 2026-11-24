import "@ui-sdk/web/alert-dialog"
import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/select"
import "@ui-sdk/web/switch"
import "@ui-sdk/web/tabs"
import type { UI } from "../src/ui"

const html = `
<ui-tabs default-value="general">
  <ui-tabs-list aria-label="Settings sections">
    <ui-tabs-tab value="general"><button type="button">General</button></ui-tabs-tab>
    <ui-tabs-tab value="notifications"><button type="button">Notifications</button></ui-tabs-tab>
    <ui-tabs-tab value="danger"><button type="button">Danger zone</button></ui-tabs-tab>
  </ui-tabs-list>
  <ui-tabs-panel value="general">
    <ui-field name="name">
      <ui-field-label>Project name</ui-field-label>
      <ui-input><input value="Apollo" required /></ui-input>
      <ui-field-error></ui-field-error>
    </ui-field>
    <ui-field>
      <ui-field-label>Visibility</ui-field-label>
      <ui-select name="visibility" default-value="private">
        <ui-select-trigger><button><ui-select-value></ui-select-value></button></ui-select-trigger>
        <ui-select-content>
          <ui-select-item value="private">Private</ui-select-item>
          <ui-select-item value="internal">Internal</ui-select-item>
          <ui-select-item value="public">Public</ui-select-item>
        </ui-select-content>
      </ui-select>
    </ui-field>
    <ui-button data-save><button>Save settings</button></ui-button>
  </ui-tabs-panel>
  <ui-tabs-panel value="notifications">
    <ui-field data-row>
      <ui-switch name="digest" checked><ui-switch-thumb></ui-switch-thumb></ui-switch>
      <ui-field-label>Weekly digest</ui-field-label>
    </ui-field>
    <ui-field data-row>
      <ui-switch name="alerts"><ui-switch-thumb></ui-switch-thumb></ui-switch>
      <ui-field-label>Deploy alerts</ui-field-label>
    </ui-field>
  </ui-tabs-panel>
  <ui-tabs-panel value="danger">
    <p>A deleted project cannot be restored.</p>
    <ui-alert-dialog>
      <ui-alert-dialog-trigger><button>Delete project</button></ui-alert-dialog-trigger>
      <ui-alert-dialog-backdrop hidden></ui-alert-dialog-backdrop>
      <ui-alert-dialog-content hidden>
        <ui-alert-dialog-title>Delete this project?</ui-alert-dialog-title>
        <ui-alert-dialog-description>The project and all its files are deleted for each member.</ui-alert-dialog-description>
        <div data-answers>
          <ui-alert-dialog-close><button>Cancel</button></ui-alert-dialog-close>
          <ui-alert-dialog-close value="confirm" data-agent-confirm="Deletes the project and all its files"><button>Delete forever</button></ui-alert-dialog-close>
        </div>
      </ui-alert-dialog-content>
    </ui-alert-dialog>
  </ui-tabs-panel>
</ui-tabs>
<p role="status" data-status>No change is saved.</p>`

const css = `
[data-stage] { display: grid; gap: 24px; max-width: 520px; }
[data-stage] ui-tabs-panel:not([hidden]) { display: grid; gap: 20px; justify-items: start; padding-top: 20px; }
[data-stage] [data-row] { flex-direction: row; align-items: center; gap: 12px; }
[data-stage] [data-answers] { display: flex; justify-content: flex-end; gap: 12px; }
[data-stage] [data-status] { margin: 0; color: var(--ui-muted-foreground); }
[data-stage] p { margin: 0; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const settings = { name: "Apollo", visibility: "private", digest: true, alerts: false }
  const status = root.querySelector("[data-status]")!
  const on = (selector: string, event: string, change: (value: never) => void) =>
    root.querySelector(selector)!.addEventListener(event, (e) => change((e as CustomEvent).detail.value as never))

  on("ui-input", "valuechange", (value: string) => (settings.name = value))
  on("ui-select", "valuechange", (value: string) => (settings.visibility = value))
  on("ui-switch[name=digest]", "checkedchange", (value: boolean) => (settings.digest = value))
  on("ui-switch[name=alerts]", "checkedchange", (value: boolean) => (settings.alerts = value))
  root.querySelector("[data-save]")!.addEventListener("action", () => {
    status.textContent = `Saved: ${settings.name}, ${settings.visibility}, weekly digest ${settings.digest ? "on" : "off"}, deploy alerts ${settings.alerts ? "on" : "off"}.`
  })
  root.querySelector("ui-alert-dialog")!.addEventListener("openchange", (e) => {
    if ((e as CustomEvent).detail.returnValue === "confirm") status.textContent = `Deleted: ${settings.name}.`
  })
}

const ui: UI = {
  id: "A01",
  request: "Build a project settings page with 3 tabs: a name and a visibility, 2 notification switches, and a delete action that asks first.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Project name", action: "setValue", args: ["Atlas"] },
      { ref: "Visibility", action: "setValue", args: ["Internal"] },
      { ref: "Settings sections", action: "setValue", args: ["Notifications"] },
      { ref: "Deploy alerts", action: "setChecked", args: [true] },
      { ref: "Settings sections", action: "setValue", args: ["Danger zone"] },
      { ref: "Delete this project?", action: "press", args: ["Delete forever"] },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Deleted: Atlas.",
  },
}

export default ui
