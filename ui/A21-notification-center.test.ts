import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./A21-notification-center"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === name)!

test("keyboard: Enter on Archive shows a toast, and Enter on its action undoes it", async () => {
  await settle()
  expect(live().map((e) => e.label)).toContain("Archive message")
  button("Archive message").focus()
  await keys("Enter")
  expect(status()).toBe("Message archived.")
  const toast = root.querySelector("ui-toast")!
  expect(toast.textContent).toContain("Message archived")
  button("Undo archive").focus()
  await keys("Enter")
  expect(status()).toBe("Message restored.")
})

test("agent: an agent archives, then presses the toast action", async () => {
  const archived = await agent.act({ steps: [{ ref: "Archive message", action: "press" }] })
  expect(archived.ok, archived.error?.message).toBe(true)
  const undone = await agent.act({ steps: [{ ref: "Message archived", action: "press", args: ["Undo archive"] }] })
  expect(undone.ok, undone.error?.message).toBe(true)
  expect(status()).toBe("Message restored.")
})
