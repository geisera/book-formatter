import { test, expect } from "@playwright/test";

test("organizes and persists sections locally, including reordered export order", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByText("Offline app ready")).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel("Book title", { exact: true }).fill("Structure test");
  await page.getByLabel("Author name", { exact: true }).fill("Test Author");
  await page.getByRole("button", { name: "Create local book" }).click();
  await page.getByRole("button", { name: "Structure", exact: true }).click();
  await expect(page.getByRole("region", { name: "Book structure editor" })).toBeVisible();
  await page.getByLabel("New section type").selectOption("prologue");
  await page.getByLabel("Section title").fill("Before the story");
  await page.getByRole("button", { name: "+ Add section" }).click();
  const items = page.locator(".structure-item-heading strong");
  await expect(items).toHaveText(["1. Chapter One", "2. Before the story"]);
  await page.getByLabel("New section type").selectOption("dedication");
  await page.getByLabel("Section title").fill("To my readers");
  await page.getByRole("button", { name: "+ Add section" }).click();
  await expect(items).toHaveText(["1. To my readers", "2. Chapter One", "3. Before the story"]);
  await page.locator(".structure-item").filter({ hasText: "Before the story" })
    .getByLabel("Type of Before the story").selectOption("preface");
  await expect(items).toHaveText(["1. To my readers", "2. Before the story", "3. Chapter One"]);
  await page.locator(".structure-item").filter({ hasText: "Before the story" })
    .getByRole("button", { name: "↑ Up" }).click();
  await expect(items).toHaveText(["1. Before the story", "2. To my readers", "3. Chapter One"]);
  await page.getByRole("button", { name: "Edit text" }).first().click();
  await expect(page.getByLabel("Chapter title")).toHaveValue("Before the story");
  await page.getByRole("textbox", { name: "Chapter manuscript" }).fill("An introductory account.");
  await page.getByRole("button", { name: "Structure", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved locally" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Structure test/ }).click();
  await page.getByRole("button", { name: "Structure", exact: true }).click();
  await expect(page.locator(".structure-item-heading strong")).toHaveText(["1. Before the story", "2. To my readers", "3. Chapter One"]);
});
