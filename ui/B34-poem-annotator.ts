import { type ChangeDetails, createChange, createRovingFocus, definePrimitive, elements, position } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import "@ui-sdk/web/toolbar"
import type { UI } from "../src/ui"

type Kind = "imagery" | "sound" | "theme"
type Mark = { kind: Kind; from: number; to: number }
type Span = { from: number; to: number }
type Reason = "item-press" | "list-navigation" | "escape-key" | "text-select" | "imperative"
type Options = {
  lines: string[]
  value?: Mark[]
  defaultValue?: Mark[]
  onValueChange?: (value: Mark[], details: ChangeDetails<Reason>) => void
  range?: Span | null
  defaultRange?: Span | null
  onRangeChange?: (range: Span | null, details: ChangeDetails<Reason>) => void
}
// lines is an option that each line renders from, so the state has a copy. pivot is the line a Shift range starts from.
type State = { lines: string[]; value: Mark[]; range: Span | null; active: string | null; pivot: number | null }

const KINDS: Kind[] = ["imagery", "sound", "theme"]
const lineStart = (lines: string[], i: number) => lines.slice(0, i).reduce((sum, line) => sum + line.length + 1, 0)
const overlaps = (a: Span, b: Span) => a.from < b.to && b.from < a.to
// Each character maps to 1 character, so an offset in the folded text is an offset in the poem.
const fold = (text: string) => text.toLowerCase().replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')

const annotator = definePrimitive({
  name: "poem-annotator",
  options: {
    lines: "value",
    value: "value",
    defaultValue: "value",
    onValueChange: "callback",
    range: "value",
    defaultRange: "value",
    onRangeChange: "callback",
  },
  controlled: ["value", "range"],
  state: (options: Options): State => ({
    lines: options.lines,
    value: options.value ?? options.defaultValue ?? [],
    range: options.range ?? options.defaultRange ?? null,
    active: null,
    pivot: null,
  }),
  sync: (options) => ({
    lines: options.lines,
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.range === undefined ? {} : { range: options.range }),
  }),
  api: (context) => {
    const change = createChange(context)
    const get = () => context.store.get()
    const roving = createRovingFocus(context, { slot: "line", key: "active" })
    const bounds = (i: number): Span => {
      const from = lineStart(get().lines, i)
      return { from, to: from + get().lines[i].length }
    }
    const lineEls = () => elements(context, "line").sort((a, b) => Number(a.key) - Number(b.key))
    // The toolbar leaves when the range is cleared, so focus inside it goes back to the line with the stop.
    const clearRange = (details: ChangeDetails<Reason> | { reason: Reason; event?: Event }) => {
      const bar = elements(context, "toolbar")[0]?.el
      const inside = !!bar && bar.contains(bar.ownerDocument.activeElement)
      change("range", null, details)
      if (inside) roving.focus()
    }
    const needRange = () => {
      const range = get().range
      if (!range) throw new Error("Select some text of the poem first.")
      return range
    }
    return {
      roving,
      lines: () => get().lines,
      selectLine: (i: number, event?: Event) => {
        context.store.set({ pivot: i })
        change("range", bounds(i), { reason: "item-press", event })
      },
      extend: (i: number, from: number, event?: Event) => {
        const pivot = get().pivot ?? from
        context.store.set({ pivot })
        change("range", { from: bounds(Math.min(pivot, i)).from, to: bounds(Math.max(pivot, i)).to }, { reason: "list-navigation", event })
      },
      selectText: (span: Span, event?: Event) => {
        context.store.set({ pivot: null })
        change("range", span, { reason: "text-select", event })
      },
      // The text offsets of a DOM range, clipped to the lines it touches.
      spanOf: (range: Range): Span | null => {
        const hit = lineEls().filter(({ el }) => range.intersectsNode(el))
        if (!hit.length) return null
        const offsetIn = (el: HTMLElement, node: Node, offset: number) => {
          const before = el.ownerDocument.createRange()
          before.selectNodeContents(el)
          before.setEnd(node, offset)
          return before.toString().length
        }
        const first = hit[0]
        const last = hit[hit.length - 1]
        const lines = get().lines
        const from = lineStart(lines, Number(first.key) - 1) + (first.el.contains(range.startContainer) ? offsetIn(first.el, range.startContainer, range.startOffset) : 0)
        const end = lineStart(lines, Number(last.key) - 1)
        let to = last.el.contains(range.endContainer) ? end + offsetIn(last.el, range.endContainer, range.endOffset) : end + lines[Number(last.key) - 1].length
        // A double-click on Windows also takes the space after the word.
        const text = lines.join("\n")
        let start = from
        while (start < to && /\s/.test(text[start])) start++
        while (to > start && /\s/.test(text[to - 1])) to--
        return to > start ? { from: start, to } : null
      },
      // The rectangle the toolbar is placed against: the rendered selection, read again on each check.
      anchor: () => {
        const marked = lineEls().flatMap(({ el }) => [...el.querySelectorAll<HTMLElement>("[data-sel]")])
        if (!marked.length) return null
        return {
          getBoundingClientRect: () => {
            const range = marked[0].ownerDocument.createRange()
            range.setStartBefore(marked[0])
            range.setEndAfter(marked[marked.length - 1])
            return range.getBoundingClientRect()
          },
        }
      },
      select: (phrase: string) => {
        const text = fold(get().lines.join("\n"))
        const from = text.indexOf(fold(String(phrase).trim()))
        if (!String(phrase).trim() || from < 0) throw new Error(`No "${phrase}" in the poem.`)
        context.store.set({ pivot: null })
        return change("range", { from, to: from + String(phrase).trim().length }, { reason: "imperative" })
      },
      deselect: (event?: Event) => {
        if (!get().range) return false
        clearRange(event ? { reason: event.type === "keydown" ? "escape-key" : "text-select", event } : { reason: "imperative" })
        return true
      },
      annotate: (kind: string, event?: Event) => {
        const name = String(kind).toLowerCase() as Kind
        if (!KINDS.includes(name)) throw new Error(`No kind "${kind}". Kinds: ${KINDS.join(", ")}.`)
        const range = needRange()
        const reason = event ? "item-press" : "imperative"
        clearRange({ reason, event })
        return change("value", [...get().value, { kind: name, from: range.from, to: range.to }], { reason, event })
      },
      erase: (event?: Event) => {
        const range = needRange()
        const reason = event ? "item-press" : "imperative"
        clearRange({ reason, event })
        return change("value", get().value.filter((mark) => !overlaps(mark, range)), { reason, event })
      },
    }
  },
  slots: (slot) => ({
    root: slot({ role: "group" }),
    poem: slot({
      role: "listbox",
      keys: { none: "Each line handles the arrow keys." },
      attrs: () => ({ "aria-multiselectable": "true" }),
      // A pointer drag ends in a DOM selection. Its text becomes the range, which the lines then draw themselves.
      bind: (el, { api }) => {
        const doc = el.ownerDocument
        let down = false
        const onDown = (event: PointerEvent) => {
          if (event.button === 0) down = true
        }
        const onUp = (event: PointerEvent) => {
          if (!down) return
          down = false
          const selection = doc.getSelection()
          const span = selection && selection.rangeCount ? api.spanOf(selection.getRangeAt(0)) : null
          selection?.removeAllRanges()
          if (span) api.selectText(span, event)
          else api.deselect(event)
        }
        el.addEventListener("pointerdown", onDown)
        doc.addEventListener("pointerup", onUp)
        return () => {
          el.removeEventListener("pointerdown", onDown)
          doc.removeEventListener("pointerup", onUp)
        }
      },
    }),
    line: slot<{ value: string }>({
      role: "option",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, { key, props, api }) => {
        const i = Number(key) - 1
        const from = lineStart(state.lines, i)
        const selected = !!state.range && overlaps(state.range, { from, to: from + (state.lines[i]?.length ?? 0) })
        return {
          tabindex: api.roving.tabIndex(state, { key, props }),
          "aria-selected": String(selected),
          "data-selected": selected ? "" : undefined,
        }
      },
      press: { none: "A click places the text selection. The poem reads it on pointerup." },
      on: {
        keydown: (event, { api, key, el }) => {
          const i = Number(key) - 1
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault()
            api.selectLine(i, event)
          } else if (event.key === "Escape") {
            if (api.deselect(event)) event.preventDefault()
          } else {
            const moved = api.roving.keydown(event, el!)
            if (moved?.shift) api.extend(Number(moved.key) - 1, Number(moved.from) - 1, event)
          }
        },
      },
      // Draws the line's text with its marks and the selected part. A mark that is new fades in.
      bind: (el, part) => {
        const stop = part.api.roving.bind(el, part)
        const doc = el.ownerDocument
        let drawn = ""
        let shown: Set<string> | null = null
        const paint = () => {
          const state = part.store.get()
          const i = Number(part.key) - 1
          const text = state.lines[i] ?? ""
          const start = lineStart(state.lines, i)
          const own = { from: start, to: start + text.length }
          const marks = state.value.filter((mark) => overlaps(mark, own))
          const sel = state.range && overlaps(state.range, own) ? state.range : null
          const key = JSON.stringify([text, marks, sel])
          if (key === drawn) return
          drawn = key
          const cuts = new Set([0, text.length])
          for (const span of sel ? [...marks, sel] : marks) {
            cuts.add(Math.max(0, Math.min(text.length, span.from - start)))
            cuts.add(Math.max(0, Math.min(text.length, span.to - start)))
          }
          const points = [...cuts].sort((a, b) => a - b)
          const nodes: Node[] = []
          for (let n = 0; n < points.length - 1; n++) {
            const piece = { from: start + points[n], to: start + points[n + 1] }
            let node: Node = doc.createTextNode(text.slice(points[n], points[n + 1]))
            if (sel && overlaps(sel, piece)) {
              const span = doc.createElement("span")
              span.setAttribute("data-sel", "")
              span.append(node)
              node = span
            }
            const mark = marks.findLast((m) => overlaps(m, piece))
            if (mark) {
              const tag = doc.createElement("mark")
              tag.setAttribute("data-kind", mark.kind)
              tag.setAttribute("data-mark", `${mark.kind}:${mark.from}-${mark.to}`)
              tag.append(node)
              node = tag
            }
            nodes.push(node)
          }
          el.replaceChildren(...nodes)
          const still = !!doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          const now = new Set<string>()
          for (const tag of el.querySelectorAll<HTMLElement>("mark")) {
            const id = tag.getAttribute("data-mark")!
            if (shown && !shown.has(id) && !still && typeof tag.animate === "function") {
              const color = doc.defaultView!.getComputedStyle(tag).backgroundColor
              tag.animate([{ backgroundColor: "transparent" }, { backgroundColor: color }], { duration: 900, easing: "ease-out" })
            }
            now.add(id)
          }
          shown = now
        }
        paint()
        const unsubscribe = part.store.subscribe(paint)
        return () => {
          stop()
          unsubscribe()
        }
      },
    }),
    toolbar: slot({
      present: (state) => !!state.range,
      on: {
        keydown: (event, { api }) => {
          if (event.key === "Escape" && api.deselect(event)) event.preventDefault()
        },
      },
      bind: (el, { api }) =>
        position(() => api.anchor(), el, {
          side: "top",
          align: "center",
          sideOffset: 10,
          arrow: () => el.querySelector<HTMLElement>("[data-arrow]"),
        }),
    }),
  }),
  agent: {
    actions: ["select", "annotate", "erase", "deselect"],
    items: (api) => api.lines().map((line) => ({ value: line, label: line })),
  },
})

const POEM = [
  "“Hope” is the thing with feathers –",
  "That perches in the soul –",
  "And sings the tune without the words –",
  "And never stops – at all –",
  "And sweetest – in the Gale – is heard –",
  "And sore must be the storm –",
  "That could abash the little Bird",
  "That kept so many warm –",
  "I’ve heard it in the chillest land –",
  "And on the strangest Sea –",
  "Yet – never – in Extremity,",
  "It asked a crumb – of me.",
]
const TEXT = POEM.join("\n")
const spanFor = (phrase: string): Span => ({ from: TEXT.indexOf(phrase), to: TEXT.indexOf(phrase) + phrase.length })
const START_MARKS: Mark[] = [
  { kind: "sound", ...spanFor("sings the tune without the words") },
  { kind: "theme", ...spanFor("never stops") },
  { kind: "imagery", ...spanFor("the chillest land") },
]
const START_RANGE = spanFor("thing with feathers")
const LABELS: Record<Kind, string> = { imagery: "Imagery", sound: "Sound", theme: "Theme" }

createParts(annotator, {
  root: {
    tag: "b34-annotator",
    display: "block",
    api: ["select", "annotate", "erase", "deselect"],
    options: () => ({ lines: POEM, defaultValue: START_MARKS, defaultRange: START_RANGE }),
  },
  poem: { tag: "b34-poem", display: "block" },
  line: { tag: "b34-line", display: "block" },
  toolbar: { tag: "b34-toolbar", display: "block" },
})

const quote = (span: Span) => `“${TEXT.slice(span.from, span.to).replaceAll("\n", " / ")}”`
const count = (marks: Mark[], kind: Kind) => marks.filter((mark) => mark.kind === kind).length

const html = `
<article data-paper>
  <h2>“Hope” is the thing with feathers</h2>
  <p data-byline>Emily Dickinson, Poems, 1891</p>
  <b34-annotator aria-label="Poem">
    <b34-poem aria-label="Lines">
      ${POEM.map((line, i) => `<b34-line value="${i + 1}"${(i + 1) % 4 === 0 ? ` data-n="${i + 1}" data-stanza-end` : ""}>${line}</b34-line>`).join("\n      ")}
    </b34-poem>
    <b34-toolbar>
      <ui-toolbar aria-label="Selection tools">
        ${KINDS.map((kind) => `<ui-toolbar-button data-kind="${kind}"><button><span data-dot aria-hidden="true"></span>${LABELS[kind]}</button></ui-toolbar-button>`).join("")}
        <ui-toolbar-separator></ui-toolbar-separator>
        <ui-toolbar-button data-erase><button>Clear</button></ui-toolbar-button>
      </ui-toolbar>
      <span data-arrow aria-hidden="true"></span>
    </b34-toolbar>
  </b34-annotator>
  <p data-legend>${KINDS.map((kind) => `<span data-key="${kind}"><span data-dot aria-hidden="true"></span>${LABELS[kind]} <b data-count="${kind}"></b></span>`).join("")}</p>
</article>
<p data-hint>Drag across words to select them. Or focus a line: Space selects it, and Shift with Up or Down extends the selection.</p>
<p role="status" data-status></p>`

const css = `
[data-stage] { display: grid; gap: 16px; justify-items: start; }
[data-stage] p { margin: 0; }
[data-stage] [data-paper] {
  width: min(100%, 600px); box-sizing: border-box; padding: 36px 40px 28px 64px;
  border: 1px solid #d8c9a8; border-radius: 4px; background: #f7f1e3; color: #2b2118;
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
}
[data-stage] [data-paper] h2 { margin: 0; font-size: 1.5rem; font-weight: 400; font-style: italic; line-height: 1.3; }
[data-stage] [data-byline] { margin-top: 6px; color: #5f4e38; font-size: 0.9375rem; font-variant: small-caps; letter-spacing: 0.04em; }
[data-stage] b34-poem { margin-top: 64px; }
[data-stage] b34-line {
  position: relative; width: fit-content; padding: 0 4px; border-radius: 2px;
  font-size: 1.125rem; line-height: 2; cursor: text;
}
[data-stage] b34-line[data-stanza-end] { margin-bottom: 1.4em; }
[data-stage] b34-line[data-n]::before {
  content: attr(data-n); position: absolute; right: 100%; margin-right: 22px;
  color: #5f4e38; font-size: 0.8125rem; font-style: italic; line-height: 2.25rem;
}
[data-stage] b34-line[data-selected]::after {
  content: ""; position: absolute; left: -12px; top: 22%; bottom: 22%; width: 2px; background: #2f4b7c;
}
[data-stage] b34-line:focus-visible { outline: 2px solid #8a5a14; outline-offset: 2px; }
[data-stage] b34-line mark { color: inherit; border-radius: 2px; }
[data-stage] mark[data-kind="imagery"], [data-stage] [data-kind="imagery"] [data-dot], [data-stage] [data-key="imagery"] [data-dot] { background: #f0d68a; }
[data-stage] mark[data-kind="sound"], [data-stage] [data-kind="sound"] [data-dot], [data-stage] [data-key="sound"] [data-dot] { background: #eec1bd; }
[data-stage] mark[data-kind="theme"], [data-stage] [data-kind="theme"] [data-dot], [data-stage] [data-key="theme"] [data-dot] { background: #c6dbbd; }
[data-stage] [data-sel] { background: #2f4b7c; color: #fbf7ee; }
[data-stage] b34-toolbar { z-index: 2; }
[data-stage] b34-toolbar[hidden] { display: none; }
[data-stage] b34-toolbar ui-toolbar {
  display: flex; align-items: center; gap: 2px; padding: 4px;
  border: 1px solid #2b2118; border-radius: 6px; background: #2b2118;
}
[data-stage] b34-toolbar button {
  display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px;
  border: 0; border-radius: 4px; background: transparent; color: #f7f1e3;
  font: 500 0.8125rem/1 system-ui, sans-serif; cursor: pointer;
}
[data-stage] b34-toolbar button:hover { background: #4a3b2c; }
[data-stage] b34-toolbar button:focus-visible { outline: 2px solid #f0d68a; outline-offset: 1px; }
[data-stage] b34-toolbar ui-toolbar-separator { align-self: stretch; width: 1px; margin: 4px 2px; background: #7a6650; }
[data-stage] [data-arrow] { position: absolute; width: 10px; height: 10px; background: #2b2118; transform: rotate(45deg); }
[data-stage] b34-toolbar[data-side="top"] [data-arrow] { top: calc(100% - 6px); }
[data-stage] b34-toolbar[data-side="bottom"] [data-arrow] { bottom: calc(100% - 6px); }
[data-stage] [data-dot] { display: inline-block; flex: none; width: 10px; height: 10px; border-radius: 50%; }
[data-stage] [data-legend] {
  display: flex; flex-wrap: wrap; gap: 20px; margin-top: 20px; padding-top: 14px;
  border-top: 1px solid #d8c9a8; color: #5f4e38; font-size: 0.9375rem;
}
[data-stage] [data-key] { display: inline-flex; align-items: center; gap: 8px; }
[data-stage] [data-count] { color: #2b2118; font-weight: 600; }
[data-stage] [data-hint], [data-stage] [data-status] { max-width: 60ch; }
[data-stage] [data-hint] { color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const el = root.querySelector("b34-annotator")! as HTMLElement & {
    api: { annotate: (kind: string, event?: Event) => void; erase: (event?: Event) => void }
  }
  const status = root.querySelector("[data-status]")!
  let marks = START_MARKS
  const tally = () => {
    for (const kind of KINDS) root.querySelector(`[data-count="${kind}"]`)!.textContent = String(count(marks, kind))
  }
  tally()
  status.textContent = `Selected ${quote(START_RANGE)}.`
  el.addEventListener("rangechange", (event) => {
    const range = (event as CustomEvent<{ value: Span | null }>).detail.value
    status.textContent = range ? `Selected ${quote(range)}.` : "No text is selected."
  })
  el.addEventListener("valuechange", (event) => {
    const next = (event as CustomEvent<{ value: Mark[] }>).detail.value
    const added = next.length > marks.length ? next[next.length - 1] : null
    const gone = marks.length - next.length
    status.textContent = added
      ? `Marked ${quote(added)} as ${added.kind}.`
      : gone
        ? `Cleared ${gone} ${gone === 1 ? "mark" : "marks"}.`
        : "No mark is in the selection."
    marks = next
    tally()
  })
  for (const button of root.querySelectorAll<HTMLElement>("[data-kind]"))
    button.addEventListener("click", (event) => el.api.annotate(button.dataset.kind!, event))
  root.querySelector("[data-erase]")!.addEventListener("click", (event) => el.api.erase(event))
}

const ui: UI = {
  id: "B34",
  request:
    "Build a poem annotator: when a person selects text, a toolbar appears above the selection and follows it, and its buttons mark the text as imagery, sound or theme.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Poem", action: "select", args: ["perches in the soul"] },
      { ref: "Selection tools", action: "press", args: ["Imagery"] },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Marked “perches in the soul” as imagery.",
  },
  breaks: [
    {
      broke: "The toolbar is no longer placed against the selected text.",
      find: "position(() => api.anchor(), el, {",
      replace: "position(() => ({ x: 0, y: 0 }), el, {",
      caught: "keyboard: the toolbar sits against the selected text and follows it",
    },
    {
      broke: "Shift with an arrow key no longer extends the selection.",
      find: "if (moved?.shift) api.extend(",
      replace: "if (false) api.extend(",
      caught: "keyboard: Shift with Down or Up extends the selection by whole lines",
    },
    {
      broke: "Escape no longer clears the selection.",
      find: '} else if (event.key === "Escape") {',
      replace: '} else if (event.key === "Esc") {',
      caught: "keyboard: Escape clears the selection and the toolbar leaves",
    },
    {
      broke: "Space and Enter no longer select the focused line.",
      find: 'if (event.key === " " || event.key === "Enter") {',
      replace: "if (false) {",
      caught: "keyboard: Space and Enter select the focused line",
    },
  ],
}

export { annotator }
export default ui
