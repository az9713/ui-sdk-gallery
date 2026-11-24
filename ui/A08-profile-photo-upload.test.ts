import { expect, test, vi } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A08-profile-photo-upload"

// jsdom has no canvas, so cropImage cannot draw. The mock records what the page asks it to cut.
const cut = vi.hoisted(() => [] as { crop: Record<string, unknown>; options: Record<string, unknown> }[])
vi.mock("@ui-sdk/web", async (original) => ({
  ...(await original<typeof import("@ui-sdk/web")>()),
  cropImage: async (_photo: unknown, crop: Record<string, unknown>, options: Record<string, unknown>) => {
    cut.push({ crop, options })
    return new File(["avatar"], "avatar.webp", { type: "image/webp" })
  },
}))
URL.createObjectURL = () => "blob:avatar"
URL.revokeObjectURL = () => {}

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const cropper = root.querySelector("ui-image-cropper") as HTMLElement & { crop: { x: number; width: number } | null; api: { getZoom(): number } }
const slider = root.querySelector("ui-slider") as HTMLElement & { value: number }
const thumb = () => root.querySelector<HTMLInputElement>("ui-slider-thumb input")!
const selection = () => root.querySelector<HTMLElement>("ui-image-cropper-selection")!
const save = () => root.querySelector<HTMLElement>("[data-save] button")!
const avatar = () => root.querySelector<HTMLImageElement>("ui-avatar img")

// jsdom does not load images, so the test tells the cropper that the 640 by 420 photo has loaded.
async function loadPhoto() {
  const img = root.querySelector("ui-image-cropper-image img") as HTMLImageElement
  Object.defineProperty(img, "naturalWidth", { value: 640, configurable: true })
  Object.defineProperty(img, "naturalHeight", { value: 420, configurable: true })
  img.dispatchEvent(new Event("load"))
  await settle()
}
const press = (key: string) => {
  selection().focus()
  selection().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
  return settle()
}

test("names: each control has the name that the page shows", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Profile photo cropper", "Zoom level", "Save photo"]) expect(labels, `${label} is not in the snapshot`).toContain(label)
  expect(root.querySelector("ui-image-cropper img")!.getAttribute("alt")).toBe("Mountains at sunset")
  expect(avatar(), "the avatar has no image before a photo is saved").toBeNull()
})

test("agent: Save photo before the photo loads says that it is loading and cuts nothing", async () => {
  expect(cropper.hasAttribute("data-loading")).toBe(true)
  const result = await agent.act({ steps: [{ ref: "Save photo", action: "press" }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("The photo is still loading.")
  expect(cut).toHaveLength(0)
  expect(avatar()).toBeNull()
})

test("keyboard: the page has 3 tab stops: the photo, the zoom slider, and Save photo", async () => {
  await loadPhoto()
  expect(cropper.hasAttribute("data-loading")).toBe(false)
  expect(tabbable(root)).toEqual([selection(), thumb(), save()])
  selection().focus()
  await keys("Tab")
  expect(document.activeElement).toBe(thumb())
  await keys("Tab")
  expect(document.activeElement).toBe(save())
  await keys("Shift+Tab", "Shift+Tab")
  expect(document.activeElement).toBe(selection())
})

test("keyboard: ArrowRight and ArrowLeft move the zoom by 0.1, and Home and End go to 1 and 4", async () => {
  const width = cropper.crop!.width
  thumb().focus()
  await keys("ArrowRight", "ArrowRight")
  expect(slider.value).toBeCloseTo(1.2)
  expect(cropper.api.getZoom()).toBeCloseTo(1.2)
  expect(cropper.crop!.width).toBeLessThan(width)
  await keys("ArrowLeft")
  expect(cropper.api.getZoom()).toBeCloseTo(1.1)
  await keys("End")
  expect(slider.value).toBe(4)
  expect(cropper.api.getZoom()).toBe(4)
  await keys("Home")
  expect(slider.value).toBe(1)
  expect(cropper.api.getZoom()).toBe(1)
  expect(cropper.crop!.width).toBe(width)
})

test("keyboard: Plus and Minus on the photo move the slider, and an arrow pans the photo", async () => {
  await press("+")
  expect(cropper.api.getZoom()).toBeGreaterThan(1)
  // The key steps the zoom by 0.25, and the slider shows the nearest of its 0.1 steps.
  expect(Math.abs(slider.value - cropper.api.getZoom())).toBeLessThan(0.06)
  await press("-")
  expect(slider.value).toBe(1)
  await press("+")
  const before = cropper.crop!.x
  await press("ArrowLeft")
  expect(cropper.crop!.x).not.toBe(before)
  await press("-")
})

test("keyboard: Enter and Space on Save photo each cut a round 128 px file and show it in the avatar", async () => {
  thumb().focus()
  await keys("Home")
  save().focus()
  await keys("Enter")
  expect(status()).toBe("Saved: 420 px crop at 1.0x zoom, shown as your avatar.")
  expect(avatar()!.getAttribute("src")).toBe("blob:avatar")
  expect(avatar()!.getAttribute("alt")).toBe("Your saved profile photo")
  expect(cut.at(-1)!.options).toEqual({ width: 128, shape: "circle", type: "image/webp" })
  expect(cut.at(-1)!.crop).toMatchObject({ x: 110, y: 0, width: 420, height: 420 })
  await keys("Space")
  expect(cut).toHaveLength(2)
  expect(root.querySelectorAll("ui-avatar")).toHaveLength(1)
  expect(root.querySelector("ui-avatar-fallback")!.textContent).toBe("You")
})

test("agent: an agent sets the zoom with the slider, saves, and the crop and the avatar follow", async () => {
  const result = await agent.act({
    steps: [
      { ref: "Zoom level", action: "setValue", args: [2.5] },
      { ref: "Save photo", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(cropper.api.getZoom()).toBe(2.5)
  expect(slider.value).toBe(2.5)
  expect(status()).toMatch(/^Saved: 168 px crop at 2\.5x zoom/)
  expect(cut.at(-1)!.crop).toMatchObject({ width: 168, height: 168 })
  expect(ui.task!.done(root)).toBe(true)
})

test("agent: an agent zooms the photo itself, and the slider shows the zoom", async () => {
  const result = await agent.act({ steps: [{ ref: "Profile photo cropper", action: "setZoom", args: [3] }] })
  expect(result.ok, result.error?.message).toBe(true)
  await settle()
  expect(slider.value).toBe(3)
})
