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
  const titleToggle = page.getByRole("checkbox", { name: "Show title on page for Before the story" });
  await expect(titleToggle).toBeChecked();
  await titleToggle.uncheck();
  await expect(titleToggle).not.toBeChecked();
  await page.locator(".structure-item").filter({ hasText: "Before the story" })
    .getByRole("button", { name: "↑ Up" }).click();
  await expect(items).toHaveText(["1. Before the story", "2. To my readers", "3. Chapter One"]);
  await page.getByRole("button", { name: "Edit text" }).first().click();
  await expect(page.getByLabel("Chapter title")).toHaveValue("Before the story");
  await page.getByRole("textbox", { name: "Chapter manuscript" }).fill("An introductory account.");
  await page.getByRole("button", { name: "Structure", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved locally" })).toBeVisible();
  await page.reload();
  await page.locator(".book-card").filter({hasText:/Structure test/}).click();
  await page.getByRole("button", { name: "Structure", exact: true }).click();
  await expect(page.locator(".structure-item-heading strong")).toHaveText(["1. Before the story", "2. To my readers", "3. Chapter One"]);
  await page.locator(".structure-item").filter({ hasText: "Before the story" }).getByText("Page Layout").click();
  // Newly added sections use defaults. Save custom layout values, then verify them on reopening.
  await expect(page.getByLabel("Start page for Before the story")).toHaveValue("next");
  await expect(page.getByLabel("Spacing before for Before the story")).toHaveValue("0");
  const row = page.locator(".structure-item").filter({ hasText: "Before the story" });
  await row.getByLabel("Start page for Before the story").selectOption("verso");
  await row.getByLabel("Vertical position for Before the story").selectOption("center");
  await row.getByLabel("Running header for Before the story").selectOption("hide");
  await row.getByLabel("Page number for Before the story").selectOption("hide");
  await row.getByLabel("Spacing before for Before the story").fill("24");
  await expect(page.getByRole("status").filter({hasText:"Saved locally"})).toBeVisible();
  await page.reload();
  await page.locator(".book-card").filter({hasText:/Structure test/}).click();
  await page.getByRole("button",{name:"Structure",exact:true}).click();
  await page.locator(".structure-item").filter({hasText:"Before the story"}).getByText("Page Layout").click();
  await expect(page.getByLabel("Start page for Before the story")).toHaveValue("verso");
  await expect(page.getByLabel("Vertical position for Before the story")).toHaveValue("center");
  await expect(page.getByLabel("Spacing before for Before the story")).toHaveValue("24");
  await expect(page.getByRole("checkbox", { name: "Show title on page for Before the story" })).not.toBeChecked();
});
