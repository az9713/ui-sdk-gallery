import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./E05-contrast-motion"

const { root, agent } = mountUI(ui)

// Splits the stylesheet into its @media blocks (one nesting level) and the rest.
function blocks(css: string) {
  const media: Record<string, string> = {}
  let rest = ""
  let i = 0
  while (i < css.length) {
    const at = css.indexOf("@media", i)
    if (at < 0) {
      rest += css.slice(i)
      break
    }
    rest += css.slice(i, at)
    const open = css.indexOf("{", at)
    let depth = 1
    let j = open + 1
    while (depth > 0 && j < css.length) depth += css[j] === "{" ? 1 : css[j] === "}" ? -1 : 0, j++
    media[css.slice(at + 6, open).trim()] = css.slice(open + 1, j - 1)
    i = j
  }
  return { media, rest }
}

test("look: the stylesheet answers 3 display modes and leaves web.css on", () => {
  expect(ui.look).toBeUndefined()
  const { media } = blocks(ui.css!)
  expect(Object.keys(media)).toEqual(["(prefers-contrast: more)", "(forced-colors: active)", "(prefers-reduced-motion: reduce)"])
})

test("look: the high-contrast block draws 2px borders and the forced-colors block uses system colors", () => {
  const { media } = blocks(ui.css!)
  expect(media["(prefers-contrast: more)"]).toContain("2px solid var(--ui-foreground)")
  expect(media["(forced-colors: active)"]).toMatch(/Highlight/)
  expect(media["(forced-colors: active)"]).toMatch(/ButtonText/)
  expect(media["(forced-colors: active)"]).not.toMatch(/var\(--ui-/)
})

test("look: the reduced-motion block removes each transition and animation that the base block adds", () => {
  const { media, rest } = blocks(ui.css!)
  expect(rest).toMatch(/transition:/)
  expect(rest).toMatch(/animation:/)
  expect(media["(prefers-reduced-motion: reduce)"]).toMatch(/transition: none/)
  expect(media["(prefers-reduced-motion: reduce)"]).toMatch(/animation: none/)
})

test("keyboard: Space changes a switch", async () => {
  ;[...root.querySelectorAll<HTMLElement>("ui-tabs-tab button")].find((b) => b.textContent === "Notifications")!.click()
  await settle()
  const digest = root.querySelector<HTMLElement>("ui-switch")!
  digest.focus()
  await keys("Space")
  expect(digest.getAttribute("aria-checked")).toBe("false")
  expect(digest.hasAttribute("data-checked")).toBe(false)
})

test("agent: the bridge finds each control by its name", async () => {
  const result = await agent.act({ steps: [{ ref: "Project name", action: "setValue", args: ["Atlas"] }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(root.querySelector("input")!.value).toBe("Atlas")
})
