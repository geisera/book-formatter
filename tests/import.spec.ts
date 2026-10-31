import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { docxFixture } from "./fixtures";

test("imports Markdown offline, edits it, and restores the original in a clean profile", async ({
  page,
  context,
  browser,
}) => {
  const sent: string[] = [];
  page.on("request", (r) => {
    if (
      (r.method() !== "GET" && r.method() !== "HEAD") ||
      new URL(r.url()).origin !== "http://127.0.0.1:3100"
    )
      sent.push(r.url());
  });
  await page.goto("/");
  await expect(page.getByText("Offline app ready")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Import a manuscript" }).click();
  const source = Buffer.from(
    "# One\n\nThe **bold** opening and *quiet* word.\n\n***\n\n# Two\n\nThe second chapter.\n\n![Map](https://example.invalid/image.png)",
  );
  await page
    .getByLabel("Manuscript file")
    .setInputFiles({
      name: "offline.md",
      mimeType: "text/markdown",
      buffer: source,
    });
  await expect(
    page.getByRole("heading", { name: "Conversion review" }),
  ).toBeVisible();
  await expect(page.getByLabel("Section 1 title", { exact: true })).toHaveValue(
    "One",
  );
  await page.getByLabel("Imported book title").fill("Imported offline");
  await page
    .getByLabel("Section 2 title", { exact: true })
    .fill("Second chapter");
  await page.getByRole("button", { name: "Import as new book" }).click();
  await expect(
    page.getByRole("textbox", { name: "Chapter manuscript" }),
  ).toContainText("The bold opening");
  await expect(page.locator(".ProseMirror strong")).toHaveText("bold");
  await expect(page.locator(".ProseMirror em")).toHaveText("quiet");
  await expect(page.locator(".ProseMirror hr")).toHaveCount(1);
  await page.getByRole("button", { name: "02 Second chapter" }).click();
  await page
    .getByRole("textbox", { name: "Chapter manuscript" })
    .fill("Edited while offline.");
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const path = await (await download).path();
  expect(path).toBeTruthy();
  await page.reload();
  await page.locator(".book-card").filter({hasText:/Imported offline/}).click();
  await page.getByRole("button", { name: "02 Second chapter" }).click();
  await expect(
    page.getByRole("textbox", { name: "Chapter manuscript" }),
  ).toHaveText("Edited while offline.");
  expect(sent).toEqual([]);
  const fresh = await browser.newContext();
  const restored = await fresh.newPage();
  await restored.goto("/");
  await restored.locator('input[accept=".zip"]').setInputFiles(path!);
  await expect(
    restored.getByRole("textbox", { name: "Chapter manuscript" }),
  ).toContainText("The bold opening");
  const originalDownload = restored.waitForEvent("download");
  await restored.getByRole("button", { name: "Download original" }).click();
  const originalPath = await (await originalDownload).path();
  expect(await readFile(originalPath!)).toEqual(source);
  await fresh.close();
});

test("DOCX conversion runs locally in the worker and preserves inline formatting", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByText("Offline app ready")).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Import a manuscript" }).click();
  await page
    .getByLabel("Manuscript file")
    .setInputFiles({
      name: "novel.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from(docxFixture()),
    });
  await expect(page.getByLabel("Section 1 title", { exact: true })).toHaveValue(
    "Chapter One",
  );
  await expect(page.getByLabel("Section 2 title", { exact: true })).toHaveValue(
    "Chapter Two",
  );
  await page.getByRole("button", { name: "Import as new book" }).click();
  await expect(page.locator(".ProseMirror strong")).toHaveText("bold words");
  await expect(page.locator(".ProseMirror em")).toHaveText("italic words");
  await expect(page.locator(".ProseMirror hr")).toHaveCount(1);
});

test("cancelling a review leaves the bookshelf unchanged; malformed input can be retried", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Import a manuscript" }).click();
  await page
    .getByLabel("Manuscript file")
    .setInputFiles({
      name: "bad.docx",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("not a zip"),
    });
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByLabel("Manuscript file")
    .setInputFiles({
      name: "valid.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "Chapter 1\nA first paragraph.\n\nChapter 2\nA second paragraph.",
      ),
    });
  await expect(page.getByLabel("Section 2 title", { exact: true })).toHaveValue(
    "Chapter 2",
  );
  await page.getByRole("button", { name: "Close import" }).click();
  await expect(page.getByText("A shelf of possibilities.")).toBeVisible();
});
