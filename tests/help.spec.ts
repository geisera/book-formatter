import { test, expect } from "@playwright/test";

test("documentation is reachable from bookshelf and an open book, including offline", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByText("Offline app ready")).toBeVisible();
  await page.getByRole("link", { name: "Open help and documentation" }).click();
  await expect(page).toHaveURL(/\/help\/?$/);
  await expect(page.getByRole("heading", { name: "Help & documentation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Import a manuscript" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Export and inspect a paperback PDF proof" })).toBeVisible();
  await page.getByRole("link", { name: "Return to your bookshelf" }).click();
  await page.getByLabel("Book title", { exact: true }).fill("Help from workspace");
  await page.getByRole("button", { name: "Create local book" }).click();
  await page.getByRole("link", { name: "Open help and documentation" }).click();
  await expect(page.getByRole("heading", { name: "Help & documentation" })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Help & documentation" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Documentation topics" }).getByRole("link")).toHaveCount(12);
});
