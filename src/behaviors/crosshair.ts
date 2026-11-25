import { css, isRTL, type PrimitiveContext } from "@ui-sdk/core"
import { clamp, stepBy, stepFromKey } from "@ui-sdk/core/number"

type CrosshairReason = "item-hover" | "track-press" | "step-key" | "escape-key" | "imperative"

// A point the crosshair stops on: its key, and where it sits along the surface, from 0 at the inline start to 1 at the end.
type CrosshairPoint = { value: string; at: number }

// Where a pointer is over the surface, from 0 to 1: x from the inline start, y from the top.
type CrosshairPointer = { x: number; y: number }

type CrosshairOptions<State extends object> = {
  // The state key that holds the point the crosshair is on, or null when it is hidden.
  key: keyof State & string
  // The state key that holds the CrosshairPointer while a pointer is over the surface, else null. Without it, the cross line stays on the point.
  pointer?: keyof State & string
  // Asks for a new point. Pass the primitive's change: `set: (value, details) => change("value", value, details)`.
  set: (value: string | null, details: { reason: CrosshairReason; event?: Event }) => boolean
  // Every point, in order along the surface. The spacing can be uneven.
  points: () => readonly CrosshairPoint[]
  // How many points Page Up, Page Down and Shift with an arrow move. Defaults to 10.
  page?: () => number
  // Where the cross line sits for a point when no pointer is over the surface, from 0 at the top to 1 at the bottom.
  cross?: (value: string) => number | undefined
  // The text screen readers hear for a point. Defaults to its value.
  label?: (value: string) => string
  // The text screen readers hear while the crosshair is hidden. Defaults to "No point".
  empty?: () => string
}

function createCrosshair<State extends object>(
  context: Pick<PrimitiveContext<unknown, State, string>, "store">,
  options: CrosshairOptions<State>,
) {
  const { store } = context
  const field = <T>(state: State, key: keyof State & string) => (state as Record<string, unknown>)[key] as T
  const valueOf = (state: State) => field<string | null | undefined>(state, options.key) ?? null
  const pointerOf = (state: State) =>
    options.pointer ? (field<CrosshairPointer | null | undefined>(state, options.pointer) ?? null) : null
  const indexOf = (value: string | null) => (value === null ? -1 : options.points().findIndex((p) => p.value === value))
  // A key shows a hidden crosshair on the last point.
  const startIndex = () => options.points().length - 1
  const setPointer = (next: CrosshairPointer | null) => {
    if (!options.pointer) return
    const now = pointerOf(store.get())
    if (now === next || (now && next && now.x === next.x && now.y === next.y)) return
    store.set({ [options.pointer]: next } as Partial<State>)
  }

  // The point closest to a place along the surface, by binary search over the ordered points.
  const nearest = (at: number) => {
    const all = options.points()
    if (!all.length) return null
    let low = 0
    let high = all.length - 1
    while (high - low > 1) {
      const middle = (low + high) >> 1
      if (all[middle].at < at) low = middle
      else high = middle
    }
    return Math.abs(all[low].at - at) <= Math.abs(all[high].at - at) ? all[low].value : all[high].value
  }

  const show = (value: string, details: { reason: CrosshairReason; event?: Event } = { reason: "imperative" }) => {
    if (indexOf(value) < 0) return false
    return valueOf(store.get()) === value || options.set(value, details)
  }
  const hide = (details: { reason: CrosshairReason; event?: Event } = { reason: "imperative" }) =>
    valueOf(store.get()) !== null && options.set(null, details)

  const track = (event: PointerEvent, el: HTMLElement, reason: "item-hover" | "track-press") => {
    const box = el.getBoundingClientRect()
    if (!box.width || !box.height) return
    const along = clamp((event.clientX - box.left) / box.width, 0, 1)
    const x = isRTL(el) ? 1 - along : along
    setPointer({ x, y: clamp((event.clientY - box.top) / box.height, 0, 1) })
    const value = nearest(x)
    if (value !== null && value !== valueOf(store.get())) options.set(value, { reason, event })
  }

  // Where the lines sit, from 0 to 1, or null while the crosshair is hidden. y follows a pointer, else the point's cross.
  const position = (state: State) => {
    const value = valueOf(state)
    const point = options.points().find((p) => p.value === value)
    if (!point) return null
    return { x: point.at, y: pointerOf(state)?.y ?? options.cross?.(point.value) }
  }

  return {
    show,
    hide,
    nearest,
    position,
    // Follows a pointer that hovers: the crosshair moves to the nearest point.
    pointermove: (event: PointerEvent, el: HTMLElement) => track(event, el, "item-hover"),
    // A press shows the crosshair at once, for touch, which has no hover.
    pointerdown: (event: PointerEvent, el: HTMLElement) => track(event, el, "track-press"),
    pointerleave(event: PointerEvent) {
      setPointer(null)
      hide({ reason: "item-hover", event })
    },
    // Arrows step 1 point, Shift and Page Up or Down step a page, Home and End go to the ends, Escape hides it. Returns whether it handled the key.
    keydown(event: KeyboardEvent, el: HTMLElement) {
      if (event.ctrlKey || event.metaKey) return false
      const all = options.points()
      const current = indexOf(valueOf(store.get()))
      if (event.key === "Escape") {
        if (current < 0) return false
        event.preventDefault()
        setPointer(null)
        options.set(null, { reason: "escape-key", event })
        return true
      }
      const move = stepFromKey(event, { dir: isRTL(el) ? "rtl" : "ltr" })
      if (!move || !all.length) return false
      event.preventDefault()
      const max = all.length - 1
      const next =
        current >= 0
          ? stepBy(current, move, { min: 0, max, step: 1, largeStep: options.page?.() ?? 10 })
          : move.bound === "min"
            ? 0
            : move.bound === "max"
              ? max
              : startIndex()
      setPointer(null)
      if (next !== current) options.set(all[next].value, { reason: "step-key", event })
      return true
    },
    // For the focusable surface, whose slot has the role "slider": one point of all of them, read out by `label`.
    surfaceAttrs(state: State) {
      const all = options.points()
      const current = indexOf(valueOf(state))
      return {
        tabindex: "0",
        "aria-roledescription": "crosshair",
        "aria-valuemin": all.length ? "1" : "0",
        "aria-valuemax": String(all.length),
        "aria-valuenow": String((current >= 0 ? current : startIndex()) + 1),
        "aria-valuetext":
          current >= 0 ? (options.label?.(all[current].value) ?? all[current].value) : (options.empty?.() ?? "No point"),
      }
    },
    // For the element that holds the lines: --crosshair-x and --crosshair-y from 0 to 1, data-crosshair while shown, data-pointer while a pointer leads.
    lineAttrs(state: State) {
      const at = position(state)
      return {
        style: css({
          "--crosshair-x": at ? String(at.x) : undefined,
          "--crosshair-y": at?.y === undefined ? undefined : String(at.y),
        }),
        "data-crosshair": at ? "" : undefined,
        "data-pointer": at && pointerOf(state) ? "" : undefined,
      }
    },
  }
}

type Crosshair = ReturnType<typeof createCrosshair>

export { type Crosshair, type CrosshairOptions, type CrosshairPoint, type CrosshairPointer, type CrosshairReason, createCrosshair }
