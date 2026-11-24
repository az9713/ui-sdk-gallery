import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A15-product-gallery"

// jsdom has no layout, so the carousel finds 1 page. Give each slide a 100 px box in a 100 px viewport.
const box = (el: Element) => {
  if (el.localName === "ui-carousel-item") return { left: [...el.parentElement!.children].indexOf(el) * 100, width: 100 }
  return { left: 0, width: el.localName === "ui-carousel-content" ? 400 : 100 }
}
Element.prototype.getBoundingClientRect = function () {
  const { left, width } = box(this)
  return { x: left, y: 0, left, top: 0, right: left + width, bottom: 100, width, height: 100, toJSON() {} } as DOMRect
}
for (const name of ["offsetWidth", "clientWidth"])
  Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get() { return box(this).width } })
Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
  configurable: true,
  get() { return this.localName === "ui-carousel-viewport" ? 400 : box(this).width },
})
Object.defineProperty(HTMLElement.prototype, "offsetLeft", { configurable: true, get() { return box(this).left } })

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const results = () => [...root.querySelectorAll("[data-results] li")].map((li) => li.textContent)
const carousel = () => root.querySelector<HTMLElement & { page: number }>("ui-carousel")!
const button = (label: string) => root.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!
const stars = () => [...root.querySelectorAll<HTMLElement>("ui-rating-radio")]
const dots = () => [...root.querySelectorAll<HTMLElement>("ui-carousel-indicator button")]
const pageButton = (n: number) => [...root.querySelectorAll<HTMLElement>("ui-pagination-link button")].find((b) => b.textContent === String(n))!
const pageStep = (text: string) => [...root.querySelectorAll<HTMLElement>("ui-pagination button")].find((b) => b.textContent === text)!

test("names: each control has the name that the page shows", async () => {
  await settle()
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  expect(live().map((entry) => entry.label)).toEqual(["Featured products", "Product score", "Result pages"])
  expect(root.querySelector("ui-carousel-indicator-group")!.getAttribute("aria-label")).toBe("Choose a product")
  expect(dots().map((dot) => dot.getAttribute("aria-label"))).toEqual(["Trail Lantern", "Ridge Backpack", "Summit Bottle", "Camp Stove"])
  expect(button("Previous product")).toBeTruthy()
  expect(button("Next product")).toBeTruthy()
  expect(stars().map((star) => star.getAttribute("aria-label"))).toEqual(["1 star", "2 stars", "3 stars", "4 stars", "5 stars"])
})

test("keyboard: Enter on Next product and Previous product moves the carousel", async () => {
  expect(carousel().page).toBe(1)
  button("Next product").focus()
  await keys("Enter")
  expect(carousel().page).toBe(2)
  button("Previous product").focus()
  await keys("Enter")
  expect(carousel().page).toBe(1)
})

test("keyboard: the indicators are 1 tab stop, and each arrow moves to a product", async () => {
  expect(dots()).toHaveLength(4)
  expect(dots().filter((dot) => dot.tabIndex === 0)).toHaveLength(1)
  dots()[0].focus()
  await keys("ArrowRight")
  expect(document.activeElement).toBe(dots()[1])
  expect(carousel().page).toBe(2)
  expect(dots()[1].getAttribute("aria-selected")).toBe("true")
  await keys("ArrowLeft")
  expect(document.activeElement).toBe(dots()[0])
  expect(carousel().page).toBe(1)
  await keys("End")
  expect(document.activeElement).toBe(dots()[3])
  expect(carousel().page).toBe(4)
  await keys("Home")
  expect(carousel().page).toBe(1)
})

test("keyboard: the rating is 1 tab stop, both arrows change the score, and Space clears it", async () => {
  expect(stars()).toHaveLength(5)
  expect(stars().filter((star) => star.tabIndex === 0)).toHaveLength(1)
  stars()[0].focus()
  await keys("ArrowRight", "ArrowRight")
  expect(stars()[2].getAttribute("aria-checked")).toBe("true")
  expect(status()).toBe("Scored Trail Lantern: 3 of 5.")
  await keys("ArrowLeft")
  expect(stars()[1].getAttribute("aria-checked")).toBe("true")
  expect(status()).toBe("Scored Trail Lantern: 2 of 5.")
  await keys("Space")
  expect(stars().some((star) => star.getAttribute("aria-checked") === "true")).toBe(false)
  expect(status()).toBe("Score cleared for Trail Lantern.")
})

test("keyboard: each product keeps its own score", async () => {
  stars()[3].click()
  await settle()
  expect(status()).toBe("Scored Trail Lantern: 4 of 5.")
  button("Next product").focus()
  await keys("Enter")
  expect(stars().some((star) => star.getAttribute("aria-checked") === "true")).toBe(false)
  expect(status()).toBe("Scored Trail Lantern: 4 of 5.")
  button("Previous product").focus()
  await keys("Enter")
  expect(stars()[3].getAttribute("aria-checked")).toBe("true")
})

test("keyboard: Previous page is disabled on page 1, and Enter on a page number shows its results", async () => {
  expect(results()).toEqual(["Trail Lantern", "Ridge Backpack", "Summit Bottle"])
  expect(pageStep("Previous page").getAttribute("aria-disabled")).toBe("true")
  expect(pageButton(1).getAttribute("aria-current")).toBe("page")
  pageButton(3).focus()
  await keys("Enter")
  expect(results()).toEqual(["Wool Socks", "Rain Shell", "Compass Watch"])
  expect(pageButton(3).getAttribute("aria-current")).toBe("page")
  expect(pageStep("Next page").getAttribute("aria-disabled")).toBe("true")
  expect(status()).toBe("Showing results 7 to 9 of 9.")
  pageStep("Previous page").focus()
  await keys("Enter")
  expect(results()).toEqual(["Camp Stove", "Dome Tent", "Fleece Jacket"])
  pageStep("Next page").focus()
  await keys("Enter")
  expect(results()[0]).toBe("Wool Socks")
  pageButton(1).focus()
  await keys("Enter")
  expect(results()[0]).toBe("Trail Lantern")
})

test("keyboard: Tab reaches the carousel, the score and the result pages", async () => {
  const stops = tabbable(root)
  expect(stops.some((el) => el.closest("ui-carousel"))).toBe(true)
  expect(stops.some((el) => el.matches("ui-rating-radio"))).toBe(true)
  expect(stops.some((el) => el.closest("ui-pagination"))).toBe(true)
})

test("agent: an agent opens a result page and picks a product", async () => {
  const done = await agent.act({
    steps: [
      { ref: "Result pages", action: "setPage", args: [2] },
      { ref: "Featured products", action: "setPage", args: [3] },
    ],
  })
  expect(done.ok, done.error?.message).toBe(true)
  expect(results()[0]).toBe("Camp Stove")
  expect(carousel().page).toBe(3)
  expect(dots()[2].getAttribute("aria-selected")).toBe("true")
  expect(live().find((entry) => entry.label === "Result pages")?.page).toBe(2)
})

test.fails("agent: an agent scores the product (the bridge lists the stars with auto ids, so setValue 4 finds no item)", async () => {
  const scored = await agent.act({ steps: [{ ref: "Product score", action: "setValue", args: [4] }] })
  expect(scored.ok, scored.error?.message).toBe(true)
  expect(status()).toBe("Scored Summit Bottle: 4 of 5.")
})
