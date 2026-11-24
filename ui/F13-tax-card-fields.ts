import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import type { UI } from "../src/ui"

const BUSINESS = "Okafor Studio LLC"

const digits = (text: string) => text.replace(/\D/g, "")
const groups = (text: string) => {
  const d = digits(text).padEnd(16, "•").slice(0, 16)
  return d.match(/.{4}/g)!.join(" ")
}
const saved = (business: string, card: string, expiry: string) =>
  `Saved for ${business}: tax ID on file, card ending ${digits(card).slice(-4)}, expires ${expiry}.`

const html = `
<div class="f13-layout">
  <div class="f13-scene" aria-hidden="true">
    <div class="f13-card" data-card data-side="front">
      <div class="f13-face f13-front">
        <div class="f13-top"><span class="f13-chip"></span><span class="f13-brand">Ledgerline</span></div>
        <p class="f13-number" data-face-number></p>
        <div class="f13-bottom">
          <div><small>Card holder</small><span data-face-name></span></div>
          <div><small>Expires</small><span data-face-expiry></span></div>
        </div>
      </div>
      <div class="f13-face f13-back">
        <span class="f13-stripe"></span>
        <div class="f13-sign"><span class="f13-sign-line"></span><span class="f13-cvc" data-face-cvc></span></div>
        <p class="f13-note">CVC: the 3 digits on the back</p>
      </div>
    </div>
  </div>
  <form class="f13-form" novalidate>
    <h2>Payout and billing</h2>
    <ui-field>
      <ui-field-label>Business name</ui-field-label>
      <ui-input><input name="business" value="${BUSINESS}" autocomplete="organization" /></ui-input>
    </ui-field>
    <ui-field data-agent-secret data-taxid>
      <ui-field-label>Tax ID</ui-field-label>
      <ui-input><input name="taxid" inputmode="numeric" placeholder="12-3456789" autocomplete="off" /></ui-input>
      <ui-field-description>EIN, 9 digits. An agent may fill it but never reads it.</ui-field-description>
    </ui-field>
    <ui-field>
      <ui-field-label>Card number</ui-field-label>
      <ui-input><input name="card" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" /></ui-input>
    </ui-field>
    <div class="f13-pair">
      <ui-field>
        <ui-field-label>Expiry</ui-field-label>
        <ui-input><input name="expiry" autocomplete="cc-exp" placeholder="MM/YY" /></ui-input>
      </ui-field>
      <ui-field data-cvc>
        <ui-field-label>Security code</ui-field-label>
        <ui-input><input name="cvc" inputmode="numeric" autocomplete="cc-csc" placeholder="123" /></ui-input>
      </ui-field>
    </div>
    <div class="f13-actions">
      <ui-button data-save><button type="button">Save payment details</button></ui-button>
      <ui-button data-flip><button type="button">Turn over</button></ui-button>
    </div>
  </form>
</div>
<p role="status" data-status>Nothing is saved.</p>`

const css = `
[data-stage] { display: grid; gap: 20px; max-width: 780px; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] .f13-layout { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 32px; align-items: start; }
[data-stage] .f13-scene { perspective: 1000px; width: 340px; height: 214px; }
[data-stage] .f13-card { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform 0.6s cubic-bezier(0.2, 0.7, 0.2, 1); }
[data-stage] .f13-card[data-side="back"] { transform: rotateY(180deg); }
[data-stage] .f13-face {
  position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden;
  border-radius: 14px; background: var(--ui-primary); color: var(--ui-primary-foreground);
  box-shadow: 0 12px 28px -12px var(--ui-shadow, rgb(0 0 0 / 0.35));
  transition: visibility 0s linear 0.3s;
}
[data-stage] .f13-card[data-side="front"] .f13-back, [data-stage] .f13-card[data-side="back"] .f13-front { visibility: hidden; }
[data-stage] .f13-front { display: grid; grid-template-rows: auto 1fr auto; padding: 20px 22px; }
[data-stage] .f13-top { display: flex; justify-content: space-between; align-items: center; }
[data-stage] .f13-chip { width: 42px; height: 30px; border-radius: 6px; background: var(--ui-muted); box-shadow: inset 0 0 0 1px var(--ui-input); }
[data-stage] .f13-brand { font-weight: 700; letter-spacing: 0.04em; }
[data-stage] .f13-number { align-self: center; font-family: var(--ui-font-mono); font-size: 1.3rem; letter-spacing: 0.08em; font-variant-numeric: tabular-nums; white-space: nowrap; }
[data-stage] .f13-bottom { display: flex; justify-content: space-between; gap: 12px; font-family: var(--ui-font-mono); }
[data-stage] .f13-bottom div { display: grid; gap: 2px; min-width: 0; }
[data-stage] .f13-bottom small { font-family: var(--ui-font-sans); font-size: 0.75rem; }
[data-stage] .f13-bottom span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
[data-stage] .f13-back { transform: rotateY(180deg); display: grid; align-content: start; gap: 16px; padding: 22px 0; }
[data-stage] .f13-stripe { height: 40px; background: var(--ui-foreground); }
[data-stage] .f13-sign { display: flex; align-items: center; gap: 10px; margin: 0 22px; padding: 6px 10px; background: var(--ui-background); color: var(--ui-foreground); border-radius: 4px; }
[data-stage] .f13-sign-line { flex: 1; height: 1px; background: var(--ui-input); }
[data-stage] .f13-cvc { font-family: var(--ui-font-mono); font-weight: 700; letter-spacing: 0.1em; }
[data-stage] .f13-note { margin: 0 22px; font-size: 0.8125rem; }
[data-stage] .f13-form { display: grid; gap: 16px; }
[data-stage] .f13-form h2 { font-size: 1.25rem; }
[data-stage] .f13-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
[data-stage] .f13-actions { display: flex; flex-wrap: wrap; gap: 12px; }
[data-stage] ui-field-description { max-width: 60ch; }
[data-stage] [data-status] { max-width: 60ch; color: var(--ui-muted-foreground); }
@media (prefers-reduced-motion: reduce) { [data-stage] .f13-card, [data-stage] .f13-face { transition: none; } }
@media (max-width: 720px) {
  [data-stage] .f13-layout { grid-template-columns: minmax(0, 1fr); }
}
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const card = root.querySelector<HTMLElement>("[data-card]")!
  const input = (name: string) => root.querySelector<HTMLInputElement>(`input[name=${name}]`)!
  const face = (name: string) => root.querySelector(`[data-face-${name}]`)!
  let turned = false
  let cvcFocus = false

  const side = () => card.setAttribute("data-side", turned !== cvcFocus ? "back" : "front")
  const draw = () => {
    face("number").textContent = groups(input("card").value)
    face("name").textContent = input("business").value || "Your business"
    face("expiry").textContent = input("expiry").value || "MM/YY"
    face("cvc").textContent = digits(input("cvc").value).padEnd(3, "•").slice(0, 3)
  }

  for (const el of root.querySelectorAll("ui-input")) {
    el.addEventListener("valuechange", draw)
    el.querySelector("input")!.addEventListener("input", draw)
  }
  const cvc = root.querySelector("[data-cvc]")!
  cvc.addEventListener("focusin", () => ((cvcFocus = true), side()))
  cvc.addEventListener("focusout", () => ((cvcFocus = false), side()))
  root.querySelector("[data-flip]")!.addEventListener("action", () => ((turned = !turned), side()))

  root.querySelector("[data-save]")!.addEventListener("action", () => {
    const missing: string[] = []
    if (!input("business").value.trim()) missing.push("business name")
    if (digits(input("taxid").value).length !== 9) missing.push("a 9-digit tax ID")
    if (digits(input("card").value).length !== 16) missing.push("a 16-digit card number")
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(input("expiry").value.trim())) missing.push("an expiry as MM/YY")
    if (!/^\d{3}$/.test(input("cvc").value.trim())) missing.push("a 3-digit security code")
    status.textContent = missing.length
      ? `Not saved. Enter ${missing.join(", ")}.`
      : saved(input("business").value.trim(), input("card").value, input("expiry").value.trim())
  })
  draw()
  side()
}

const ui: UI = {
  id: "F13",
  request:
    "Build a payout and billing form with a business name, a tax ID that an agent may fill but never read back, card fields, and a card picture that turns over to show the security code.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Tax ID", action: "setValue", args: ["12-3456789"] },
      { ref: "Card number", action: "setValue", args: ["4242 4242 4242 4242"] },
      { ref: "Expiry", action: "setValue", args: ["09/29"] },
      { ref: "Security code", action: "setValue", args: ["314"] },
      { ref: "Save payment details", action: "press" },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === saved(BUSINESS, "4242 4242 4242 4242", "09/29"),
  },
}

export default ui
