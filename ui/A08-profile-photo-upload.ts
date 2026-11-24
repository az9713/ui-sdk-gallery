import "@ui-sdk/web/avatar"
import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/image-cropper"
import "@ui-sdk/web/slider"
import { cropImage } from "@ui-sdk/web"
import type { UI } from "../src/ui"

const photo = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="#e5e5e5"/><circle cx="460" cy="150" r="56" fill="#fafafa"/><path d="M0 280 120 170l110 100 120-130 130 125 90-60 70 40v175H0z" fill="#a3a3a3"/><path d="M0 330l160-80 120 70 150-80 210 85v95H0z" fill="#525252"/><path d="M0 380q160-35 320-10t320-5v55H0z" fill="#262626"/></svg>`,
)}`

// The avatar holds an image only after a photo is saved: an image with no source shows as an invisible box.
const avatarHtml = (src: string) =>
  `<ui-avatar aria-label="Your profile avatar">${src ? `<img src="${src}" alt="Your saved profile photo" />` : ""}<ui-avatar-fallback>You</ui-avatar-fallback></ui-avatar>`

const html = `
<ui-image-cropper aria-label="Profile photo cropper" src="${photo}" mode="frame" aspect-ratio="1" shape="circle" max-zoom="4">
  <ui-image-cropper-viewport>
    <ui-image-cropper-image><img alt="Mountains at sunset" /></ui-image-cropper-image>
    <ui-image-cropper-selection></ui-image-cropper-selection>
  </ui-image-cropper-viewport>
</ui-image-cropper>
<ui-field>
  <ui-slider aria-label="Zoom level" default-value="1" min="1" max="4" step="0.1">
    <div data-row>
      <ui-field-label>Zoom level</ui-field-label>
      <ui-slider-value></ui-slider-value>
    </div>
    <ui-slider-control>
      <ui-slider-track>
        <ui-slider-indicator></ui-slider-indicator>
        <ui-slider-thumb></ui-slider-thumb>
      </ui-slider-track>
    </ui-slider-control>
  </ui-slider>
</ui-field>
<div data-row data-result>
  <ui-button data-save><button>Save photo</button></ui-button>
  <span data-avatar>${avatarHtml("")}</span>
</div>
<p role="status" data-status>No photo is saved.</p>`

const css = `
[data-stage] { display: grid; gap: 20px; max-width: 320px; }
[data-stage] ui-image-cropper { max-width: 320px; }
[data-stage] [data-row] { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
[data-stage] [data-result] { justify-content: flex-start; gap: 20px; }
[data-stage] ui-avatar { width: 72px; height: 72px; border-radius: 50%; font-size: 14px; }
[data-stage] [data-status] { margin: 0; color: var(--ui-muted-foreground); }
`

type CropperElement = HTMLElement & {
  api: { getZoom(): number; setZoom(zoom: number): boolean }
  crop: Parameters<typeof cropImage>[1] | null
}
type SliderElement = HTMLElement & { value: number }

function mount(root: HTMLElement) {
  root.innerHTML = html
  const cropper = root.querySelector("ui-image-cropper") as CropperElement
  const slider = root.querySelector("ui-slider") as SliderElement
  const avatar = root.querySelector("[data-avatar]")!
  const status = root.querySelector("[data-status]")!
  const zoomText = (zoom: number) => `${zoom.toFixed(1)}x`
  let saved = ""
  let syncing = false

  // The slider sets the zoom of the cropper. A wheel, pinch or key on the cropper moves the slider.
  slider.addEventListener("valuechange", (e) => {
    if (!syncing) cropper.api.setZoom((e as CustomEvent).detail.value as number)
  })
  cropper.addEventListener("cropchange", () =>
    // The event fires before the zoom is stored, so read the zoom one microtask later.
    queueMicrotask(() => {
      syncing = true
      slider.value = Math.round(cropper.api.getZoom() * 10) / 10
      syncing = false
    }),
  )

  root.querySelector("[data-save]")!.addEventListener("action", async () => {
    const crop = cropper.crop
    if (!crop) {
      status.textContent = "The photo is still loading."
      return
    }
    try {
      const file = await cropImage(photo, crop, { width: 128, shape: "circle", type: "image/webp" })
      if (saved) URL.revokeObjectURL(saved)
      saved = URL.createObjectURL(file)
      avatar.innerHTML = avatarHtml(saved)
      status.textContent = `Saved: ${Math.round(crop.width)} px crop at ${zoomText(cropper.api.getZoom())} zoom, shown as your avatar.`
    } catch {
      status.textContent = "The photo could not be saved."
    }
  })
  return () => {
    if (saved) URL.revokeObjectURL(saved)
  }
}

const ui: UI = {
  id: "A08",
  request: "Build a profile photo upload: crop the photo in a round frame, set the zoom with a slider, and show the saved crop as an avatar.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Zoom level", action: "setValue", args: [2.5] },
      { ref: "Save photo", action: "press" },
    ],
    done: (root) => /^Saved: .* at 2\.5x zoom/.test(root.querySelector("[data-status]")!.textContent ?? "") && !!root.querySelector("ui-avatar img")?.getAttribute("src"),
  },
}

export default ui
