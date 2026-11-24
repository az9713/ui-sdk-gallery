import {
  announce,
  type ChangeDetails,
  createChange,
  createRovingFocus,
  definePrimitive,
  elements,
  prepareAnnouncements,
  selects,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import { gsap } from "gsap"
import type { UI } from "../src/ui"

type Status = "queued" | "uploading" | "done" | "failed" | "canceled"
type Entry = { percent: number; status: Status; retried: boolean }
type Value = Record<string, Entry>
type Reason = "progress" | "retry" | "cancel"
type Options = {
  broken?: string[]
  value?: Value
  defaultValue?: Value
  onValueChange?: (value: Value, details: ChangeDetails<Reason>) => void
}
// broken is an option that the api reads, so the state has a copy: a part must not read an option.
type State = { active: string | null; value: Value; broken: string[] }
type Message = { text: string; urgent: boolean }

const WAITING: Entry = { percent: 0, status: "queued", retried: false }
const PART = 25

const note = ({ percent, status }: Entry) =>
  ({
    queued: "Waiting",
    uploading: `Uploading ${percent}%`,
    done: "Uploaded",
    failed: `Failed at ${percent}%`,
    canceled: "Canceled",
  })[status]

// The progress ring of a frame: a circle of radius 18 in a 48 x 48 box. The arc grows by its dash offset.
const CIRCUMFERENCE = 2 * Math.PI * 18
const orbits = new WeakMap<Element, gsap.core.Tween>()
const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

// Draws the ring of 1 file. The first call sets the state at once; later calls tween it. The state is already in the DOM.
function drawRing(el: Element, { percent, status }: Entry, animate: boolean) {
  const arc = el.querySelector("[data-arc]")
  const orbit = el.querySelector("[data-orbit]")
  if (!arc) return
  const attr = { "stroke-dashoffset": CIRCUMFERENCE * (1 - percent / 100) }
  if (animate && !calm()) gsap.to(arc, { attr, duration: 0.6, ease: "power2.out", overwrite: true })
  else gsap.set(arc, { attr })
  if (!orbit) return
  const running = orbits.get(el)
  if (status === "uploading" && !calm()) {
    if (running) return
    const tween: gsap.core.Tween = gsap.to(orbit, {
      rotation: 360,
      svgOrigin: "24 24",
      duration: 4,
      ease: "none",
      repeat: -1,
      onRepeat: () => {
        if (!el.isConnected) tween.kill()
      },
    })
    orbits.set(el, tween)
  } else if (running) {
    running.kill()
    orbits.delete(el)
  }
}

const uploadQueue = definePrimitive({
  name: "upload-queue",
  options: { broken: "list", value: "value", defaultValue: "value", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    active: null,
    value: options.value ?? options.defaultValue ?? {},
    broken: options.broken ?? [],
  }),
  sync: (options) => ({
    broken: options.broken ?? [],
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: (context) => {
    const change = createChange(context)
    const roving = createRovingFocus(context, { slot: "file", key: "active" })
    const ids = () => elements<{ value: string }>(context, "file").map((part) => part.key)
    const entry = (id: string) => context.store.get().value[id] ?? WAITING
    const pending = (id: string) => entry(id).status === "queued" || entry(id).status === "uploading"
    const commit = (updates: Value, reason: Reason, event?: Event) =>
      change("value", { ...context.store.get().value, ...updates }, { reason, event })
    const count = (status: Status) => ids().filter((id) => entry(id).status === status).length
    // The sentence that closes the queue: it names the failures, or says that all is done.
    const closing = () =>
      ids().some(pending) ? "" : count("failed") ? ` ${count("failed")} failed.` : " Queue finished."
    const say = (messages: Message[]) => {
      const pick = messages.findLast((message) => message.urgent) ?? messages.at(-1)
      if (pick) announce(pick.text, pick.urgent ? { priority: "assertive" } : undefined)
    }

    // Moves the first waiting file 1 part on, and says what a person must hear about it.
    const step = (event?: Event): Message | null => {
      const id = ids().find(pending)
      if (!id) return null
      const before = entry(id)
      const percent = Math.min(100, before.percent + PART)
      if (percent === 50 && context.store.get().broken.includes(id) && !before.retried) {
        commit({ [id]: { ...before, percent, status: "failed" } }, "progress", event)
        return { text: `${id} failed at ${percent}%. Press R on it to retry.`, urgent: true }
      }
      commit({ [id]: { ...before, percent, status: percent === 100 ? "done" : "uploading" } }, "progress", event)
      if (percent === 100) return { text: `${id} uploaded. ${count("done")} of ${ids().length} done.${closing()}`, urgent: false }
      if (percent === 50) return { text: `${id} is 50% uploaded.`, urgent: false }
      return null
    }

    return {
      roving,
      ids,
      entry,
      advance: (parts = 1, event?: Event) => {
        const messages: Message[] = []
        let moved = 0
        for (let i = 0; i < Math.max(1, Math.floor(parts)); i++) {
          if (!ids().some(pending)) break
          const message = step(event)
          if (message) messages.push(message)
          moved++
        }
        say(messages)
        return moved > 0
      },
      retry: (id?: string, event?: Event) => {
        const targets = (id === undefined ? ids() : [id]).filter((one) => entry(one).status === "failed")
        if (!targets.length) return false
        const updates: Value = {}
        for (const one of targets) updates[one] = { ...entry(one), status: "uploading", retried: true }
        commit(updates, "retry", event)
        announce(targets.length === 1 ? `Retrying ${targets[0]} from ${entry(targets[0]).percent}%.` : `Retrying ${targets.length} files.`)
        return true
      },
      cancel: (id: string, event?: Event) => {
        if (!ids().includes(id) || !["queued", "uploading", "failed"].includes(entry(id).status)) return false
        commit({ [id]: { ...entry(id), status: "canceled" } }, "cancel", event)
        announce(`Canceled ${id}.${closing()}`)
        return true
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "list",
      keys: { none: "Each file handles the arrow keys." },
      // The live regions must exist before the first message, or some screen readers miss it.
      bind: (el) => prepareAnnouncements(el.ownerDocument),
    }),
    file: slot<{ value: string }>({
      role: "listitem",
      focus: "roving",
      props: { value: "string" },
      selects: selects({ active: ({ key }) => [key, null] }),
      attrs: (state, { key, props, api }) => {
        const entry = state.value[key] ?? WAITING
        return {
          tabindex: api.roving.tabIndex(state, { key, props }),
          "data-state": entry.status,
          "data-percent": String(entry.percent),
        }
      },
      press: { none: "A file has no default action. R and Delete are handled in keydown." },
      on: {
        keydown: (event, { el, api, key }) => {
          if (event.ctrlKey || event.metaKey || event.altKey) return
          if (event.key === "r" || event.key === "R") {
            if (api.retry(key, event)) event.preventDefault()
          } else if (event.key === "Delete" || event.key === "Backspace") {
            if (api.cancel(key, event)) event.preventDefault()
          } else api.roving.keydown(event, el!)
        },
      },
      bind: (el, part) => {
        const leave = part.api.roving.bind(el, part)
        const text = el.querySelector("[data-note]")
        const show = (animate: boolean) => {
          const entry = part.store.get().value[part.key] ?? WAITING
          if (text) text.textContent = note(entry)
          drawRing(el, entry, animate)
        }
        show(false)
        const stop = part.store.subscribe(() => show(true))
        return () => {
          stop()
          leave()
          orbits.get(el)?.kill()
          orbits.delete(el)
          gsap.killTweensOf(el.querySelector("[data-arc]"))
        }
      },
    }),
  }),
  agent: {
    actions: ["advance", "retry", "cancel"],
    items: (api) => api.ids().map((id) => ({ value: id, label: id })),
  },
})

createParts(uploadQueue, {
  root: { tag: "b21-upload-queue", api: ["advance", "retry"] },
  file: "b21-file",
})

const FILES = ["m31-ha-0001.fits", "m31-ha-0002.fits", "ngc7000-oiii-0003.fits", "m42-lum-0004.fits"]
// The page opens with the night partly sent: frame 1 is in the archive and frame 2 is half way.
const START: Value = {
  "m31-ha-0001.fits": { percent: 100, status: "done", retried: false },
  "m31-ha-0002.fits": { percent: 50, status: "uploading", retried: false },
}

// A small seeded random function, so the sky is the same on each run.
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const ring = `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <circle data-track cx="24" cy="24" r="18" />
  <circle data-arc cx="24" cy="24" r="18" transform="rotate(-90 24 24)" stroke-dasharray="${CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="${CIRCUMFERENCE.toFixed(2)}" />
  <circle data-orbit cx="24" cy="2" r="1.6" />
  <circle data-star cx="24" cy="24" r="2" />
  <path data-check d="M16.5 24.5l5 5 10-11" />
  <path data-bang d="M24 16v9M24 30.5v.5" />
</svg>`

const sky = () => {
  const random = seeded(2112)
  const stars = Array.from({ length: 46 }, () => {
    const big = random() > 0.85
    return `<circle data-twinkle cx="${(random() * 330).toFixed(1)}" cy="${(random() * 52).toFixed(1)}" r="${big ? 1.4 : 0.8}" />`
  })
  return `<svg data-sky viewBox="0 0 440 64" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  ${stars.join("")}
  <path data-dome d="M356 64a34 34 0 0 1 68 0z" />
  <path data-slit d="M386 31l8 0 0 33-8 0z" />
</svg>`
}

const html = () => `
<div class="b21-obs">
  ${sky()}
  <h2>Uploading to the Atlas Observatory archive</h2>
  <p id="b21-help">${FILES.length} FITS frames from the night of 23 November. Arrow keys choose a file. R retries a failed file. Delete cancels a file.</p>
  <div data-queue></div>
  <div data-actions>
    <ui-button data-next><button>Upload next part</button></ui-button>
    <ui-button data-retry><button>Retry failed</button></ui-button>
  </div>
  <p role="status" aria-live="off" data-status></p>
</div>`

const files = FILES.map(
  (name) => `<b21-file value="${name}">${ring}<span>${name}</span> <small data-note>Waiting</small></b21-file>`,
).join("")

const css = `
[data-stage] .b21-obs {
  --ui-background: #0a0f1f; --ui-foreground: #e6ecff; --ui-muted: #1a2547; --ui-muted-foreground: #a3b1d6;
  --ui-border: #2a3558; --ui-input: #5a6ca3; --ui-primary: #5eead4; --ui-primary-foreground: #04201c;
  --ui-destructive: #ff8a80; --ui-ring: #fcd34d;
  display: grid; gap: 14px; max-width: 480px; padding: 16px 20px 20px; border-radius: 12px;
  background: var(--ui-background); color: var(--ui-foreground);
}
[data-stage] .b21-obs h2, [data-stage] .b21-obs p { margin: 0; }
[data-stage] .b21-obs h2 { font-size: 1.0625rem; font-weight: 600; }
[data-stage] .b21-obs #b21-help, [data-stage] .b21-obs [data-status] { color: var(--ui-muted-foreground); font-size: 0.875rem; max-width: 60ch; }
[data-stage] .b21-obs [data-status] { font-variant-numeric: tabular-nums; }
[data-stage] .b21-obs [data-sky] { display: block; width: 100%; height: 64px; border-radius: 8px; background: #0f1730; }
[data-stage] .b21-obs [data-twinkle] { fill: #e6ecff; }
[data-stage] .b21-obs [data-dome] { fill: #1a2547; stroke: var(--ui-input); stroke-width: 1; }
[data-stage] .b21-obs [data-slit] { fill: #0f1730; }
[data-stage] .b21-obs [data-queue] { display: grid; }
[data-stage] b21-upload-queue { display: grid; gap: 8px; width: 100%; }
[data-stage] b21-file {
  display: grid; grid-template-columns: 48px 1fr; column-gap: 14px; row-gap: 2px; align-items: center;
  padding: 10px 14px; border: 1px solid var(--ui-border); border-radius: 10px; background: #111a33;
}
[data-stage] b21-file > svg { grid-row: 1 / span 2; width: 48px; height: 48px; overflow: visible; }
[data-stage] b21-file span { font-family: var(--ui-font-mono, ui-monospace, monospace); font-size: 0.9375rem; font-weight: 600; overflow-wrap: anywhere; }
[data-stage] b21-file small { color: var(--ui-muted-foreground); font-size: 0.8125rem; font-variant-numeric: tabular-nums; }
[data-stage] b21-file:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] b21-file circle, [data-stage] b21-file path { fill: none; }
[data-stage] b21-file [data-track] { stroke: #2a3558; stroke-width: 4; }
[data-stage] b21-file [data-arc] { stroke: var(--ui-primary); stroke-width: 4; stroke-linecap: butt; }
[data-stage] b21-file [data-orbit] { display: none; fill: #fcd34d; }
[data-stage] b21-file [data-star] { fill: #5a6ca3; }
[data-stage] b21-file [data-check], [data-stage] b21-file [data-bang] { display: none; stroke: var(--ui-primary); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
[data-stage] b21-file[data-state="uploading"] [data-orbit] { display: block; }
[data-stage] b21-file[data-state="uploading"] [data-star] { fill: var(--ui-primary); }
[data-stage] b21-file[data-state="done"] [data-star] { display: none; }
[data-stage] b21-file[data-state="done"] [data-check] { display: block; }
[data-stage] b21-file[data-state="failed"] [data-arc], [data-stage] b21-file[data-state="failed"] [data-bang] { stroke: var(--ui-destructive); }
[data-stage] b21-file[data-state="failed"] [data-star] { display: none; }
[data-stage] b21-file[data-state="failed"] [data-bang] { display: block; }
[data-stage] b21-file[data-state="failed"] small { color: var(--ui-destructive); font-weight: 600; }
[data-stage] b21-file[data-state="canceled"] span { text-decoration: line-through; }
[data-stage] b21-file[data-state="canceled"] [data-arc] { stroke: #5a6ca3; }
[data-stage] .b21-obs [data-actions] { display: flex; gap: 8px; flex-wrap: wrap; }
`

type QueueElement = HTMLElement & {
  defaultValue: Value
  api: { advance: (parts?: number) => boolean; retry: (id?: string) => boolean }
}

// One line for the status text: how many are done, and how many failed or were canceled.
function summary(value: Value) {
  const entries = Object.values(value)
  const of = (state: Status) => entries.filter((one) => one.status === state).length
  const extra = (["failed", "canceled"] as const).filter(of).map((state) => `, ${of(state)} ${state}`)
  return `${of("done")} of ${FILES.length} uploaded${extra.join("")}.`
}

function mount(root: HTMLElement) {
  root.innerHTML = html()
  const queue = document.createElement("b21-upload-queue") as QueueElement
  queue.setAttribute("aria-label", "Upload queue")
  queue.setAttribute("aria-describedby", "b21-help")
  queue.setAttribute("broken", "ngc7000-oiii-0003.fits")
  queue.defaultValue = START
  queue.innerHTML = files
  root.querySelector("[data-queue]")!.append(queue)
  const status = root.querySelector("[data-status]")!
  status.textContent = summary(START)
  queue.addEventListener("valuechange", (event) => {
    status.textContent = summary((event as CustomEvent<{ value: Value }>).detail.value)
  })
  root.querySelector("[data-next]")!.addEventListener("action", () => queue.api.advance())
  root.querySelector("[data-retry]")!.addEventListener("action", () => queue.api.retry())

  // The stars twinkle. The tween ends by itself when the page leaves the document.
  const stars = root.querySelectorAll("[data-twinkle]")
  if (!calm() && stars.length) {
    const random = seeded(7)
    const tween: gsap.core.Tween = gsap.to(stars, {
      opacity: 0.25,
      duration: () => 1.2 + random() * 2,
      delay: () => random() * 2,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      onRepeat: () => {
        if (!root.isConnected) tween.kill()
      },
    })
  }
}

const ui: UI = {
  id: "B21",
  request:
    "Build an upload queue for telescope frames where each file shows a progress ring, and a screen reader hears the progress at 50% and when a file is done, hears a failure at once, and can retry a failed file with R.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Upload queue", action: "advance", args: [4] },
      { ref: "Upload queue", action: "advance", args: [4] },
      { ref: "Upload queue", action: "retry", args: ["ngc7000-oiii-0003.fits"] },
      { ref: "Upload queue", action: "advance", args: [2] },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "4 of 4 uploaded.",
  },
  breaks: [
    {
      broke: "Every file is a tab stop.",
      find: "tabindex: api.roving.tabIndex(state, { key, props }),",
      replace: 'tabindex: "0",',
      caught: "keyboard: the queue is 1 tab stop, and the arrow keys move focus",
    },
    {
      broke: "R no longer retries a failed file.",
      find: 'if (event.key === "r" || event.key === "R") {',
      replace: "if (false) {",
      caught: "keyboard: R retries the focused file only when it failed",
    },
    {
      broke: "Delete and Backspace no longer cancel a file.",
      find: 'else if (event.key === "Delete" || event.key === "Backspace") {',
      replace: "else if (false) {",
      caught: "keyboard: Delete and Backspace cancel a file that is not done",
    },
    {
      broke: "A failure is announced politely, so it waits behind other speech.",
      find: 'pick.urgent ? { priority: "assertive" } : undefined',
      replace: "undefined",
      caught: "keyboard: on the page, a failure is announced assertively and a finished file politely",
    },
    {
      broke: "The 50% milestone is not announced.",
      find: "if (percent === 50) return { text: `${id} is 50% uploaded.`, urgent: false }",
      replace: "",
      caught: "keyboard: a file is announced at 50% and when it is done, and not at 25% or 75%",
    },
    {
      broke: "A finished file does not say how many are done.",
      find: "${count(\"done\")} of ${ids().length} done.${closing()}",
      replace: "",
      caught: "keyboard: a file is announced at 50% and when it is done, and not at 25% or 75%",
    },
    {
      broke: "The live regions are not prepared before the first message.",
      find: "bind: (el) => prepareAnnouncements(el.ownerDocument),",
      replace: "bind: () => {},",
      caught: "keyboard: the queue prepares both live regions when it mounts",
    },
    {
      broke: "A failing file does not stop at 50%.",
      find: "context.store.get().broken.includes(id) && !before.retried",
      replace: "false",
      caught: "keyboard: a failed file is announced at once and the upload goes on with the next file",
    },
    {
      broke: "An agent can no longer drive the queue.",
      find: 'actions: ["advance", "retry", "cancel"],',
      replace: "actions: [],",
      caught: "agent: an agent uploads 2 files, retries the failed file and finishes the queue",
    },
  ],
}

export { uploadQueue }
export default ui
