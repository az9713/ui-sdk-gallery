declare global {
  var __UI_SDK_STRICT__: boolean | undefined
}
globalThis.__UI_SDK_STRICT__ = true

// The stubs of skills/ui-sdk/references/testing.md. Assigned, not `??=`: jsdom has some without the parts that matter.
HTMLElement.prototype.showPopover = function () {}
HTMLElement.prototype.hidePopover = function () {}
Element.prototype.getAnimations = () => []
Element.prototype.scrollIntoView = function () {}
Element.prototype.checkVisibility = () => true
Element.prototype.getClientRects = () => [] as unknown as DOMRectList
document.elementFromPoint = () => null
document.elementsFromPoint = () => []
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
document.head.append(
  Object.assign(document.createElement("style"), { textContent: "[popover] { display: block !important }" }),
)

// jsdom's ElementInternals lacks what form-associated custom elements call.
const attachInternals = HTMLElement.prototype.attachInternals
HTMLElement.prototype.attachInternals = function () {
  const internals = (attachInternals ? attachInternals.call(this) : {}) as ElementInternals & Record<string, unknown>
  internals.setFormValue ??= () => {}
  internals.setValidity ??= () => {}
  internals.checkValidity ??= () => true
  internals.reportValidity ??= () => true
  if (!internals.states) Object.defineProperty(internals, "states", { value: new Set() })
  return internals
}

export {}
