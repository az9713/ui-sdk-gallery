import { easeCubicOut, max, scaleLinear, select } from "d3"
import {
  type ChangeDetails,
  createChange,
  createFocusRecovery,
  createRovingFocus,
  definePrimitive,
} from "@ui-sdk/core"
import { createParts, wrappedButton } from "@ui-sdk/web"
import type { UI } from "../src/ui"

// "remove-key" is not in the shared vocabulary: Delete or Backspace on a focused tag.
type Reason = "item-press" | "remove-key" | "imperative"
type Options = {
  tags: Record<string, string>
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[], details: ChangeDetails<Reason>) => void
}
// tags is an option that each tag renders from, so the state has a copy. Its key order is the order of the tags.
type State = { tags: Record<string, string>; value: string[]; active: string | null }

const tagList = definePrimitive({
  name: "tag-list",
  options: { tags: "value", value: "list", defaultValue: "list", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    tags: options.tags,
    value: options.value ?? options.defaultValue ?? Object.keys(options.tags),
    active: null,
  }),
  sync: (options) => ({
    tags: options.tags,
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const roving = createRovingFocus<State, { value: string }>(context, {
      slot: "tag",
      key: "active",
      orientation: () => "horizontal",
    })
    // The fallback runs after the state change: it walks the original order from the tag that left, the next one first.
    const recovery = createFocusRecovery<{ value: string }>({
      fallback: (lost) => {
        const { tags, value } = store.get()
        const order = Object.keys(tags)
        const at = order.indexOf(lost.key)
        const present = (keys: string[]) => keys.find((key) => value.includes(key))
        const after = present(order.slice(at + 1))
        const before = present(order.slice(0, Math.max(at, 0)).reverse())
        const next = after ?? before
        return next ? context.element("tag", next) : undefined
      },
    })

    const take = (key: string, details: { reason: Reason; event?: Event }) => {
      const { value } = store.get()
      if (!value.includes(key)) return false
      return change("value", value.filter((item) => item !== key), details)
    }
    const find = (tag: unknown) => {
      const { tags, value } = store.get()
      const text = String(tag).toLowerCase()
      const key = value.find((id) => id === tag || tags[id].toLowerCase() === text)
      if (!key) throw new Error(`No tag "${tag}". Tags: ${value.map((id) => tags[id]).join(", ")}.`)
      return key
    }

    return {
      roving,
      recovery,
      take,
      tags: () => store.get().value.map((id) => ({ value: id, label: store.get().tags[id] })),
      remove: (tag: string) => take(find(tag), { reason: "imperative" }),
    }
  },
  slots: (slot) => ({
    root: slot({ role: "list" }),
    tag: slot<{ value: string }>({
      role: "listitem",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, part) => ({ tabindex: part.api.roving.tabIndex(state, part) }),
      on: {
        keydown: (event, { el, api, key }) => {
          if (event.target !== el) return
          if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault()
            api.take(key, { reason: "remove-key", event })
          } else api.roving.keydown(event, el!)
        },
      },
      bind: (el, part) => {
        const cleanups = [part.api.roving.bind(el, part), part.api.recovery.bind(el, part)]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
    // The mouse button of a tag. The keyboard removes a tag with Delete, so the button is not a tab stop.
    remove: slot<{ value: string }>({
      role: "button",
      focus: "native",
      props: { value: "string" },
      attrs: (state, { props }) => ({
        type: "button",
        tabindex: "-1",
        "aria-label": `Remove ${state.tags[props.value] ?? props.value}`,
      }),
      press: ({ api, key }, event) => api.take(key, { reason: "item-press", event }),
    }),
  }),
  agent: { actions: ["remove"], items: (api) => api.tags() },
})

// Web components keep their markup, so the root takes a tag out of the page when the state no longer lists it.
createParts(tagList, {
  root: {
    tag: "b25-tag-list",
    display: "block",
    options: () => ({ tags: NAMES }),
    render: (el, instance) => {
      const update = () => {
        const { value } = instance.get() as State
        for (const tag of el.querySelectorAll<HTMLElement>("b25-tag")) {
          if (!value.includes(tag.getAttribute("value")!)) tag.remove()
        }
      }
      update()
      return instance.subscribe(update)
    },
  },
  tag: { tag: "b25-tag", display: "block" },
  remove: { tag: "b25-tag-remove", target: wrappedButton, display: "contents" },
})

const SPECIES = [
  { id: "mallard", name: "Mallard", emoji: "🦆", seen: 14 },
  { id: "barn-owl", name: "Barn owl", emoji: "🦉", seen: 2 },
  { id: "red-kite", name: "Red kite", emoji: "🦅", seen: 5 },
  { id: "mute-swan", name: "Mute swan", emoji: "🦢", seen: 7 },
  { id: "wood-pigeon", name: "Wood pigeon", emoji: "🕊️", seen: 18 },
  { id: "robin", name: "Robin", emoji: "🐦", seen: 11 },
  { id: "pheasant", name: "Pheasant", emoji: "🐓", seen: 6 },
]
const NAMES = Object.fromEntries(SPECIES.map((s) => [s.id, s.name]))
const SEEN = Object.fromEntries(SPECIES.map((s) => [s.id, s.seen]))
const MOST = max(SPECIES, (s) => s.seen) ?? 1

const STEP = 30
const BAR_MAX = 260
const HEIGHT = SPECIES.length * STEP

const html = `
<article data-notebook>
  <p data-trip>Field trip, Brackwater Marsh, 14 November</p>
  <h2>Species seen</h2>
  <b25-tag-list aria-label="Bird tags">${SPECIES.map(
    (s) => `<b25-tag value="${s.id}" data-emoji="${s.emoji}">${s.name}<b25-tag-remove value="${s.id}"><button></button></b25-tag-remove></b25-tag>`,
  ).join("")}</b25-tag-list>
  <p data-hint>Press Delete or Backspace on a tag, or its cross button, to take it off the list.</p>
  <h2>Sightings per species</h2>
  <div data-chart role="img"></div>
  <p role="status" data-status></p>
</article>`

const css = `
[data-stage] { display: block; }
[data-stage] [data-notebook] {
  display: grid; gap: 14px; justify-items: start; max-width: 520px; padding: 22px 24px 22px 40px;
  background: #fbf6e3; color: #2b2a33; border: 1px solid #cfc49b; border-radius: 2px;
  box-shadow: inset 26px 0 0 #fbf6e3, inset 28px 0 0 #c9524a, 0 2px 0 #e4dbb9;
}
[data-stage] [data-notebook] h2, [data-stage] [data-notebook] p { margin: 0; }
[data-stage] [data-notebook] h2 {
  font-family: "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive; font-size: 1.125rem; font-weight: 600;
  padding-bottom: 4px; border-bottom: 1px solid #a9bfd6; width: 100%;
}
[data-stage] [data-trip] { font-size: 0.8125rem; color: #5a5648; font-style: italic; }
[data-stage] b25-tag-list { display: flex; flex-wrap: wrap; gap: 8px; }
[data-stage] b25-tag {
  display: inline-flex;
  align-items: center; gap: 6px; padding: 3px 4px 3px 10px; background: #fffdf4; color: #2b2a33;
  border: 1.5px dashed #6b6450; border-radius: 999px; font-size: 0.875rem; cursor: default; user-select: none;
}
[data-stage] b25-tag::before { content: attr(data-emoji); font-size: 1rem; line-height: 1; }
[data-stage] b25-tag:focus-visible { outline: 2px solid #1d4f8c; outline-offset: 2px; background: #ffffff; }
[data-stage] b25-tag-remove button {
  display: inline-grid; place-items: center; width: 24px; height: 24px; padding: 0; margin: 0;
  background: transparent; color: #2b2a33; border: 0; border-radius: 50%; font: inherit; cursor: pointer;
}
[data-stage] b25-tag-remove button::before { content: "\\00d7"; font-size: 1.125rem; line-height: 1; }
[data-stage] b25-tag-remove button:hover { background: #e9dfbd; }
[data-stage] b25-tag-remove button:focus-visible { outline: 2px solid #1d4f8c; outline-offset: 1px; }
[data-stage] [data-hint] { font-size: 0.8125rem; color: #5a5648; max-width: 60ch; }
[data-stage] [data-chart] { position: relative; width: 100%; height: ${HEIGHT}px; }
[data-stage] [data-chart] [data-bar] {
  position: absolute; top: 0; left: 0; display: grid; grid-template-columns: 96px auto auto; justify-content: start;
  align-items: center; column-gap: 8px; height: ${STEP}px; font-size: 0.8125rem;
}
[data-stage] [data-chart] [data-name] { text-align: end; color: #2b2a33; }
[data-stage] [data-chart] svg { display: block; }
[data-stage] [data-chart] rect { fill: #2f5d8a; }
[data-stage] [data-chart] [data-value] { color: #2b2a33; font-weight: 600; }
[data-stage] [data-status] { font-size: 0.875rem; color: #2b2a33; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const list = root.querySelector<HTMLElement>("b25-tag-list")!
  const status = root.querySelector("[data-status]")!
  const chart = select(root.querySelector<HTMLElement>("[data-chart]")!)
  const x = scaleLinear().domain([0, MOST]).range([0, BAR_MAX])
  const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  let left = SPECIES.map((s) => s.id)

  // Bars keep their length when one leaves: the scale is fixed, and the rows below move up.
  // Labels are HTML, since axe cannot decide the contrast of text inside an inline svg.
  function draw(animate: boolean) {
    const rows = chart.selectAll<HTMLDivElement, string>("div[data-bar]").data(left, (id) => id)
    rows.exit().remove()
    const entered = rows.enter().append("div").attr("data-bar", (id) => id)
    entered.append("span").attr("data-name", "").text((id) => NAMES[id])
    entered
      .append("svg")
      .attr("aria-hidden", "true")
      .attr("width", (id) => x(SEEN[id]))
      .attr("height", STEP - 10)
      .append("rect")
      .attr("width", (id) => x(SEEN[id]))
      .attr("height", STEP - 10)
      .attr("rx", 2)
    entered.append("span").attr("data-value", "").text((id) => SEEN[id])
    const all = entered.merge(rows)
    const place = (id: string) => `translateY(${left.indexOf(id) * STEP}px)`
    if (animate && typeof all.transition === "function") all.transition().duration(250).ease(easeCubicOut).style("transform", place)
    else all.style("transform", place)
    const total = left.reduce((sum, id) => sum + SEEN[id], 0)
    chart.attr("aria-label", `Sightings per species, ${total} in all: ${left.map((id) => `${NAMES[id]} ${SEEN[id]}`).join(", ") || "none left"}.`)
    return total
  }
  const total = draw(false)
  status.textContent = `${left.length} species on the list, ${total} sightings.`

  list.addEventListener("valuechange", (event) => {
    const value = (event as CustomEvent<{ value: string[] }>).detail.value
    const gone = left.filter((id) => !value.includes(id)).map((id) => NAMES[id])
    left = SPECIES.map((s) => s.id).filter((id) => value.includes(id))
    const sum = draw(!reduced)
    status.textContent = `Removed ${gone.join(", ")}. ${left.length} species left, ${sum} sightings.`
  })
}

const ui: UI = {
  id: "B25",
  request:
    "Build a tag list of the bird species seen on a field trip: Delete or a cross button removes a tag, focus goes to a neighbor tag when the focused tag leaves, and a bar chart of sightings updates.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Bird tags", action: "remove", args: ["Robin"] },
      { ref: "Bird tags", action: "remove", args: ["Pheasant"] },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Removed Pheasant. 5 species left, 46 sightings." &&
      root.querySelectorAll("b25-tag").length === 5 &&
      root.querySelectorAll("[data-chart] [data-bar]").length === 5,
  },
  breaks: [
    {
      broke: "Focus is not recovered when the focused tag leaves.",
      find: "part.api.recovery.bind(el, part)",
      replace: "() => {}",
      caught: "keyboard: removing the focused tag moves focus to the next tag",
    },
    {
      broke: "Focus recovery has no neighbor before, so the last tag leaves focus on the page.",
      find: "const next = after ?? before",
      replace: "const next = after",
      caught: "keyboard: removing the last tag moves focus to the one before it",
    },
    {
      broke: "Backspace no longer removes the focused tag.",
      find: 'event.key === "Delete" || event.key === "Backspace"',
      replace: 'event.key === "Delete"',
      caught: "keyboard: Delete and Backspace remove the focused tag",
    },
    {
      broke: "The cross button no longer removes its tag.",
      find: 'press: ({ api, key }, event) => api.take(key, { reason: "item-press", event }),',
      replace: "press: () => false,",
      caught: "keyboard: the cross button removes its tag and is not a tab stop",
    },
  ],
}

export { tagList }
export default ui
