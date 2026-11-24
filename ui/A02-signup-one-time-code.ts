import "@ui-sdk/web/button"
import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/otp-input"
import "@ui-sdk/web/password-input"
import type { UI } from "../src/ui"

const slots = "<ui-otp-input-slot></ui-otp-input-slot>".repeat(3)

const html = `
<ui-field>
  <ui-field-label>Email address</ui-field-label>
  <ui-input><input type="email" autocomplete="email" /></ui-input>
</ui-field>
<ui-field>
  <ui-field-label>Choose a password</ui-field-label>
  <ui-password-input name="password">
    <input autocomplete="new-password" />
    <ui-password-input-toggle><button aria-label="Show password"></button></ui-password-input-toggle>
  </ui-password-input>
  <ui-field-description>Use at least 8 characters.</ui-field-description>
</ui-field>
<ui-field>
  <ui-field-label>Verification code</ui-field-label>
  <ui-otp-input max-length="6" auto-complete="one-time-code">
    <ui-otp-input-group>${slots}</ui-otp-input-group>
    <ui-otp-input-separator></ui-otp-input-separator>
    <ui-otp-input-group>${slots}</ui-otp-input-group>
  </ui-otp-input>
  <ui-field-description>We sent a 6-digit code to your email.</ui-field-description>
</ui-field>
<ui-field data-row>
  <ui-checkbox name="terms"><ui-checkbox-indicator></ui-checkbox-indicator></ui-checkbox>
  <ui-field-label>I accept the terms</ui-field-label>
</ui-field>
<ui-button data-submit><button>Create account</button></ui-button>
<p role="status" data-status>No account is created.</p>`

const css = `
[data-stage] { display: grid; gap: 20px; max-width: 420px; justify-items: start; }
[data-stage] ui-field { width: 100%; }
[data-stage] [data-row] { flex-direction: row; align-items: center; gap: 12px; }
[data-stage] ui-otp-input-group { display: flex; gap: 6px; }
[data-stage] ui-otp-input { display: flex; align-items: center; gap: 8px; }
[data-stage] ui-otp-input-slot { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 44px; border: 1px solid var(--ui-border); border-radius: 6px; }
[data-stage] ui-otp-input-slot[data-active] { border-color: var(--ui-ring); }
[data-stage] ui-otp-input input { opacity: 0 !important; }
[data-stage] [data-status] { margin: 0; color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const form = { email: "", password: "", code: "", terms: false }
  const status = root.querySelector("[data-status]")!
  const on = (selector: string, event: string, change: (value: never) => void) =>
    root.querySelector(selector)!.addEventListener(event, (e) => change((e as CustomEvent).detail.value as never))

  on("ui-input", "valuechange", (value: string) => (form.email = value))
  on("ui-password-input", "valuechange", (value: string) => (form.password = value))
  on("ui-otp-input", "valuechange", (value: string) => (form.code = value))
  on("ui-checkbox", "checkedchange", (value: boolean) => (form.terms = value))
  root.querySelector("[data-submit]")!.addEventListener("action", () => {
    if (!form.email) status.textContent = "Enter your email address."
    else if (form.password.length < 8) status.textContent = "The password needs at least 8 characters."
    else if (form.code.length < 6) status.textContent = "Enter the 6-digit code."
    else if (!form.terms) status.textContent = "Accept the terms to continue."
    else status.textContent = `Account created for ${form.email}.`
  })
}

const ui: UI = {
  id: "A02",
  request: "Build a sign-up form with an email, a password with a show toggle, a 6-digit one-time code, a terms checkbox and a Create account button.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Email address", action: "setValue", args: ["ana@example.com"] },
      { ref: "Choose a password", action: "setValue", args: ["correct-horse-9"] },
      { ref: "Verification code", action: "setValue", args: ["123456"] },
      { ref: "I accept the terms", action: "setChecked", args: [true] },
      { ref: "Create account", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Account created for ana@example.com.",
  },
}

export default ui
