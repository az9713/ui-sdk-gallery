import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./E03-light-compact"

const { root, agent } = mountUI(ui)

test("look: the css sets --ui-* tokens, color-scheme, and background and color from tokens on [data-ui=E03]", () => {
  const css = ui.css!
  const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  expect(blocks).toHaveLength(1)
  expect(blocks[0][1].trim()).toBe('[data-ui="E03"]')
  const decls = blocks[0][2].split(";").map((d) => d.trim()).filter(Boolean).map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()])
  const names = decls.map(([n]) => n)
  expect(names).toContain("color-scheme")
  for (const [name, value] of decls) {
    if (name === "background" || name === "color") expect(value).toMatch(/^var\(--ui-[\w-]+\)$/)
    else expect(name === "color-scheme" || name.startsWith("--ui-")).toBe(true)
  }
  expect(names.filter((n) => n === "background" || n === "color")).toEqual(["background", "color"])
  expect(ui.look).toBeUndefined()
})

test("keyboard: Space changes a switch", async () => {
  ;[...root.querySelectorAll<HTMLElement>("ui-tabs-tab button")].find((b) => b.textContent === "Notifications")!.click()
  await settle()
  const digest = root.querySelector<HTMLElement>("ui-switch")!
  digest.focus()
  await keys("Space")
  expect(digest.getAttribute("aria-checked")).toBe("false")
})

test("agent: the bridge finds each control by its name", async () => {
  const result = await agent.act({ steps: [{ ref: "Project name", action: "setValue", args: ["Atlas"] }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(root.querySelector("input")!.value).toBe("Atlas")
})
