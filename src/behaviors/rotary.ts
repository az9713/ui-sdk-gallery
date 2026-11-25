import { bindDrag, type PrimitiveContext } from "@ui-sdk/core"
import { clamp, fractionOf, maxOnGrid, type NumberRange, scrubTo, stepBy, stepFromKey, wrap } from "@ui-sdk/core/number"

type RotaryReason = "drag" | "step-key" | "imperative"

type RotaryOptions<State extends object> = {
  /** Reads the value from state. */
  value: (state: State) => number
  /** Asks for a new value and returns whether it went through. Pass the primitive's change. */
  set: (value: number, details: { reason: RotaryReason; event?: Event }) => boolean
  /** The bounds, the step and the large step. A range that wraps needs a step above 0. */
  range: () => NumberRange
  /** Whether the value goes round from max back to min, like a longitude or a phase, instead of stopping at the ends. @defaultValue false */
  wrap?: () => boolean
  /** How many degrees the pointer turns from min to max. @defaultValue 270, or 360 when the range wraps */
  sweep?: () => number
  /** The text screen readers hear for the value. */
  valueText?: (value: number) => string
  /** Pointer moves nearer the center than this many pixels turn nothing, since their angle jumps. @defaultValue 10 */
  deadZone?: number
}

// Degrees clockwise from 12 o'clock, from -180 to 180.
const angleAt = (dx: number, dy: number) => (Math.atan2(dx, -dy) * 180) / Math.PI

/**
 * Turns a value by dragging the pointer around the element's center, and steps it with keys.
 * Call it once in `api` and wire 1 slot with `role: "slider"`:
 * `attrs` spreads `attrs(state)` and `style(state)`, `on.keydown` calls `keydown`, `on.pointerdown` calls `pointerdown`.
 */
function createRotary<State extends object>(
  context: Pick<PrimitiveContext<any, State, any>, "store" | "onDestroy">,
  options: RotaryOptions<State>,
) {
  const loops = () => options.wrap?.() ?? false
  const sweep = () => options.sweep?.() ?? (loops() ? 360 : 270)
  // In a loop, max is the same point as min, so the last value is 1 step before it.
  const last = (range: NumberRange) => (loops() ? range.max - range.step : maxOnGrid(range))
  const fit = (value: number) => {
    const range = options.range()
    if (!loops()) return scrubTo(value, range).value
    return wrap(scrubTo(wrap(value, range.min, range.max), range).value, range.min, range.max)
  }
  const fraction = (state: State) => {
    const range = options.range()
    return fractionOf(options.value(state), range)
  }

  let stop: (() => void) | undefined
  context.onDestroy(() => stop?.())

  return {
    /** Sets the value, on the step grid, wrapped or kept within the bounds. Returns whether it changed. */
    set: (next: number) => options.set(fit(next), { reason: "imperative" }),
    /** Where the value sits, from 0 at min to 1 at max. */
    fraction,
    /** The angle of the value, in degrees clockwise from 12 o'clock: from -sweep/2 at min to sweep/2 at max. */
    angle: (state: State) => (fraction(state) - 0.5) * sweep(),
    /** Follows the pointer around the element's center until it lifts. Call from the slot's `pointerdown`. */
    pointerdown(event: PointerEvent, el: HTMLElement) {
      if (event.button !== 0) return
      el.focus({ preventScroll: true })
      stop?.()
      const deadZone = options.deadZone ?? 10
      const from = (x: number, y: number) => {
        const box = el.getBoundingClientRect()
        const dx = x - (box.left + box.width / 2)
        const dy = y - (box.top + box.height / 2)
        return Math.hypot(dx, dy) < deadZone ? null : angleAt(dx, dy)
      }
      let previous = from(event.clientX, event.clientY)
      // The value before snapping, so moves smaller than a step add up.
      let raw = options.value(context.store.get())
      stop = bindDrag(el, event, {
        onMove: ({ x, y, event: move }) => {
          const now = from(x, y)
          if (now === null) return
          if (previous !== null) {
            const range = options.range()
            const turned = wrap(now - previous, -180, 180)
            const moved = raw + (turned / sweep()) * (range.max - range.min)
            raw = loops() ? wrap(moved, range.min, range.max) : clamp(moved, range.min, range.max)
            const next = fit(raw)
            if (next !== options.value(context.store.get())) options.set(next, { reason: "drag", event: move })
          }
          previous = now
        },
        onEnd: () => (stop = undefined),
      })
    },
    /** Handles a key and returns whether it did. Up and Right turn clockwise in both text directions, as a knob does. */
    keydown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey) return false
      const move = stepFromKey(event)
      if (!move) return false
      event.preventDefault()
      const range = options.range()
      const value = options.value(context.store.get())
      let next: number
      if (move.bound) next = move.bound === "min" ? range.min : last(range)
      else if (!loops()) next = stepBy(value, move, range)
      else {
        const size = move.size === "large" ? (range.largeStep ?? range.step * 10) : move.size === "small" ? (range.smallStep ?? range.step) : range.step
        next = fit(value + move.direction * size)
      }
      if (next !== value) options.set(next, { reason: "step-key", event })
      return true
    },
    /** The slider's value for screen readers, with a tab stop, and `data-wrap` on a range that goes round. */
    attrs(state: State) {
      const range = options.range()
      const value = options.value(state)
      return {
        tabindex: "0",
        "aria-valuemin": String(range.min),
        "aria-valuemax": String(last(range)),
        "aria-valuenow": String(value),
        "aria-valuetext": options.valueText?.(value),
        "data-wrap": loops() ? "" : undefined,
      }
    },
    /** `--rotary-angle` in degrees and `--rotary-fraction` from 0 to 1, as a `style` attribute, to turn a cap or fill an arc in CSS. */
    style(state: State) {
      const turn = Math.round((fraction(state) - 0.5) * sweep() * 100) / 100
      return `--rotary-angle: ${turn}deg; --rotary-fraction: ${Math.round(fraction(state) * 10000) / 10000}`
    },
  }
}

type Rotary = ReturnType<typeof createRotary>

export { createRotary, type Rotary, type RotaryOptions, type RotaryReason }
