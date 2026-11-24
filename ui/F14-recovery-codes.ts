import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import "@ui-sdk/web/switch"
import { gsap } from "gsap"
import type { UI } from "../src/ui"

const factors = [
  { value: "app", label: "Authenticator app" },
  { value: "key", label: "Security key" },
  { value: "sms", label: "Text message" },
] as const

const COUNT = 10
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const C = 120
const WHEEL = `rotate(0 ${C} ${C})`
const WHEEL_OPEN = `rotate(-300 ${C} ${C})`
const BOLTS = `translate(${C} ${C}) scale(1) translate(-${C} -${C})`
const BOLTS_OPEN = `translate(${C} ${C}) scale(0.82) translate(-${C} -${C})`

// Seeded so the codes are the same in each screenshot and each test run.
function codes(seed: number) {
  let s = seed
  const next = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  const part = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(next() * ALPHABET.length)]).join("")
  return Array.from({ length: COUNT }, () => `${part()}-${part()}`)
}

const ring = (count: number, r: number, size: number) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2
    return `<circle cx="${(C + Math.cos(a) * r).toFixed(1)}" cy="${(C + Math.sin(a) * r).toFixed(1)}" r="${size}"/>`
  }).join("")

const door = `
<svg viewBox="0 0 240 240" aria-hidden="true" focusable="false">
  <rect x="4" y="4" width="232" height="232" rx="18" fill="#1e293b" stroke="#475569" stroke-width="2"/>
  <g data-bolts fill="#94a3b8" transform="${BOLTS}">
    <rect x="112" y="6" width="16" height="26" rx="3"/><rect x="112" y="208" width="16" height="26" rx="3"/>
    <rect x="208" y="112" width="26" height="16" rx="3"/><rect x="6" y="112" width="26" height="16" rx="3"/>
  </g>
  <rect x="10" y="56" width="14" height="34" rx="4" fill="#64748b"/><rect x="10" y="150" width="14" height="34" rx="4" fill="#64748b"/>
  <circle cx="${C}" cy="${C}" r="96" fill="#334155" stroke="#64748b" stroke-width="4"/>
  <circle cx="${C}" cy="${C}" r="80" fill="none" stroke="#475569" stroke-width="2"/>
  <g fill="#64748b">${ring(16, 88, 2.6)}</g>
  <g data-wheel transform="${WHEEL}" stroke="#cbd5e1" stroke-linecap="round">
    <path d="M${C} ${C - 54}V${C + 54}M${C - 47} ${C - 27}L${C + 47} ${C + 27}M${C - 47} ${C + 27}L${C + 47} ${C - 27}" stroke-width="7"/>
    <g fill="#2dd4bf" stroke="none">${ring(6, 56, 7)}</g>
    <circle cx="${C}" cy="${C}" r="22" fill="#1e293b" stroke-width="4"/>
    <circle cx="${C}" cy="${C}" r="7" fill="#fb923c" stroke="none"/>
  </g>
</svg>`

const html = `
<div data-console>
  <section data-signin aria-labelledby="f14-signin-title">
    <h2 id="f14-signin-title">Sign-in security</h2>
    <p data-note>Account of Ines Vandal. An agent may change these settings.</p>
    <ui-field data-row>
      <ui-switch name="twostep" checked><ui-switch-thumb></ui-switch-thumb></ui-switch>
      <ui-field-label>Two-step sign-in</ui-field-label>
    </ui-field>
    <ui-field>
      <ui-field-label>Second factor</ui-field-label>
      <ui-select default-value="app">
        <ui-select-trigger><button><ui-select-value></ui-select-value></button></ui-select-trigger>
        <ui-select-content>
          ${factors.map((f) => `<ui-select-item value="${f.value}">${f.label}</ui-select-item>`).join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
    <p data-devices>3 other devices are signed in.</p>
    <ui-button data-signout><button>Sign out other devices</button></ui-button>
    <p role="status" data-status></p>
  </section>
  <section data-vault-card aria-labelledby="f14-vault-title" data-agent-hidden>
    <h2 id="f14-vault-title">Recovery codes vault</h2>
    <p data-note>Each code signs you in 1 time when you lose your second factor. This section has <code>data-agent-hidden</code>: the agent bridge does not see it.</p>
    <div data-vault>
      <ol data-codes aria-label="Recovery codes" hidden>
        ${Array.from({ length: COUNT }, () => `<li><code></code></li>`).join("")}
      </ol>
      <div data-door>${door}</div>
    </div>
    <div data-buttons>
      <ui-button data-open><button>Open vault</button></ui-button>
      <ui-button data-regenerate><button>Regenerate codes</button></ui-button>
    </div>
    <p role="status" data-vault-status></p>
  </section>
</div>`

const MONO = `ui-monospace, "Cascadia Mono", Consolas, monospace`

const css = `
[data-stage] [data-console] { display: flex; flex-wrap: wrap; gap: 24px; align-items: start; }
[data-stage] h2 { margin: 0; font-size: 1.125rem; font-weight: 600; }
[data-stage] p, [data-stage] ol { margin: 0; }
[data-stage] [data-note] { max-width: 60ch; color: var(--ui-muted-foreground); font-size: 0.875rem; line-height: 1.5; }
[data-stage] [data-signin] { display: grid; gap: 18px; width: min(100%, 320px); justify-items: start; }
[data-stage] [data-signin] ui-field { justify-self: stretch; }
[data-stage] [data-row] { flex-direction: row; align-items: center; gap: 12px; }
[data-stage] [data-status] { max-width: 60ch; }
[data-stage] [data-vault-card] {
  --ui-background: #0f172a;
  --ui-foreground: #e2e8f0;
  --ui-muted-foreground: #94a3b8;
  --ui-border: #475569;
  --ui-input: #64748b;
  --ui-primary: #2dd4bf;
  --ui-primary-foreground: #0f172a;
  --ui-secondary: #1e293b;
  --ui-secondary-foreground: #e2e8f0;
  --ui-ring: #5eead4;
  display: grid; gap: 16px; width: min(100%, 420px); padding: 20px;
  border: 1px solid #334155; border-radius: 12px; background: #0f172a; color: #e2e8f0;
}
[data-stage] [data-vault-card] code { font-family: ${MONO}; }
[data-stage] [data-vault] { display: grid; justify-self: center; width: 260px; height: 260px; }
[data-stage] [data-vault] > * { grid-area: 1 / 1; }
[data-stage] [data-door] { z-index: 1; }
[data-stage] [data-door] svg { display: block; width: 260px; height: 260px; }
[data-stage] [data-codes] {
  display: grid; grid-template-columns: repeat(2, 1fr); align-content: center; gap: 10px 14px;
  padding: 16px 18px 16px 40px; border: 1px solid #475569; border-radius: 18px; background: #111c30;
}
[data-stage] [data-codes][hidden] { display: none; }
[data-stage] [data-codes] li { color: #94a3b8; font-size: 0.8125rem; }
[data-stage] [data-codes] li code { color: #e2e8f0; font-size: 0.9375rem; letter-spacing: 0.04em; }
[data-stage] [data-buttons] { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
[data-stage] [data-vault-status] { color: #cbd5e1; max-width: 60ch; text-align: center; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  const settings = { twostep: true, factor: "app", devices: 3 }
  const vault = { open: false, seed: 1409, batch: 1 }

  const status = root.querySelector("[data-status]")!
  const devices = root.querySelector("[data-devices]")!
  const vaultStatus = root.querySelector("[data-vault-status]")!
  const card = root.querySelector<HTMLElement>("[data-vault-card]")!
  const list = root.querySelector<HTMLOListElement>("[data-codes]")!
  const doorBox = root.querySelector<HTMLElement>("[data-door]")!
  const wheel = root.querySelector("[data-wheel]")!
  const bolts = root.querySelector("[data-bolts]")!
  const openButton = root.querySelector("[data-open] button")!
  const items = [...list.querySelectorAll("li")]

  const report = () => {
    const factor = factors.find((f) => f.value === settings.factor)!.label
    status.textContent = `Two-step sign-in ${settings.twostep ? "on" : "off"}. Second factor: ${factor}. Vault ${vault.open ? "open" : "sealed"}.`
    devices.textContent = settings.devices ? `${settings.devices} other devices are signed in.` : "No other device is signed in."
  }
  const fill = () => codes(vault.seed).forEach((code, i) => (items[i].querySelector("code")!.textContent = code))

  const timeline = gsap
    .timeline({ paused: true })
    .to(wheel, { attr: { transform: WHEEL_OPEN }, duration: 0.7, ease: "power2.inOut" })
    .to(bolts, { attr: { transform: BOLTS_OPEN }, duration: 0.3, ease: "power1.in" }, "-=0.15")
    .to(doorBox, { rotationY: -112, transformOrigin: "0% 50%", transformPerspective: 900, duration: 0.8, ease: "power2.in" })
    .to(doorBox, { autoAlpha: 0, duration: 0.2 }, "-=0.2")
    .from(items, { opacity: 0, y: 6, stagger: 0.04, duration: 0.25, immediateRender: false })

  const play = () => {
    if (calm) timeline.progress(vault.open ? 1 : 0)
    else if (vault.open) timeline.play()
    else timeline.reverse()
  }

  root.querySelector("ui-switch")!.addEventListener("checkedchange", (e) => {
    settings.twostep = (e as CustomEvent<{ value: boolean }>).detail.value
    report()
  })
  root.querySelector("ui-select")!.addEventListener("valuechange", (e) => {
    settings.factor = (e as CustomEvent<{ value: string }>).detail.value
    report()
  })
  root.querySelector("[data-signout]")!.addEventListener("action", () => {
    settings.devices = 0
    report()
  })
  root.querySelector("[data-open]")!.addEventListener("action", () => {
    vault.open = !vault.open
    list.hidden = !vault.open
    card.toggleAttribute("data-open", vault.open)
    openButton.textContent = vault.open ? "Seal vault" : "Open vault"
    vaultStatus.textContent = vault.open ? `Vault open. Batch ${vault.batch}: ${COUNT} codes. Store them offline.` : "Vault sealed."
    report()
    play()
  })
  root.querySelector("[data-regenerate]")!.addEventListener("action", () => {
    vault.seed += 7919
    vault.batch += 1
    fill()
    vaultStatus.textContent = `Batch ${vault.batch}: ${COUNT} new codes. The old codes no longer work.`
  })

  fill()
  report()
  vaultStatus.textContent = "Vault sealed."
}

const ui: UI = {
  id: "F14",
  request:
    "Build an account security page with two-step sign-in settings that an agent may change, and a recovery codes vault behind an animated vault door that the agent cannot see or open.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Second factor", action: "setValue", args: ["Security key"] },
      { ref: "Sign out other devices", action: "press" },
      { ref: "Open vault", action: "press" },
    ],
    person: "deny",
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Two-step sign-in on. Second factor: Security key. Vault sealed." &&
      root.querySelector("[data-devices]")!.textContent === "No other device is signed in." &&
      root.querySelector("[data-codes]")!.hasAttribute("hidden"),
  },
}

export default ui
