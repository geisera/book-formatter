import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";

test("exports an imported, formatted book entirely offline and tracks exact snapshots", async ({
  page,
  context,
}) => {
  const outbound: string[] = [];
  page.on("request", (request) => {
    if (
      (request.method() !== "GET" && request.method() !== "HEAD") ||
      new URL(request.url()).origin !== "http://127.0.0.1:3100"
    )
      outbound.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByText("Offline app ready")).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Import a manuscript" }).click();
  await page
    .getByLabel("Manuscript file")
    .setInputFiles({
      name: "export.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "# First & Foremost\n\nA **bold** and *quiet* opening.\n\n***\n\nAnother scene.\n\n# The End\n\nThe last words.",
      ),
    });
  await expect(page.getByLabel("Section 2 title", { exact: true })).toHaveValue(
    "The End",
  );
  await page.getByLabel("Imported book title").fill("Offline export novel");
  await page.getByLabel("Imported author name").fill("Tony");
  await page.getByRole("button", { name: "Import as new book" }).click();
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page
    .getByLabel("Scene ornament", { exact: true })
    .selectOption("diamonds");
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Generate & download EPUB" }).click();
  const path = await (await downloaded).path();
  const bytes = new Uint8Array(await readFile(path!));
  const files = unzipSync(bytes);
  expect(strFromU8(files["EPUB/chapter-0001.xhtml"])).toContain("◆ ◆ ◆");
  expect(strFromU8(files["EPUB/chapter-0001.xhtml"])).toContain(
    "<strong>bold</strong>",
  );
  expect(strFromU8(files["EPUB/nav.xhtml"])).toContain("First &amp; Foremost");
  expect(files["EPUB/fonts/regular.woff"]).toBeTruthy();
  expect(outbound).toEqual([]);
  await expect(
    page.getByText("EPUBCheck has not run on this file.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Current snapshot", { exact: true }),
  ).toBeVisible();
  // Validate the actual offline browser-generated file with EPUBCheck in the CI proof step.
  await mkdir("artifacts/epub", { recursive: true });
  await writeFile("artifacts/epub/browser-export.epub", bytes);
  await page.reload();
  await page.locator(".book-card").filter({hasText:/Offline export novel/}).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByText("Current snapshot", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Manuscript", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Chapter manuscript" })
    .fill("An updated manuscript.");
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByText("Earlier snapshot", { exact: true }),
  ).toBeVisible();
});

test("preflight explains blockers and publication details can be corrected locally", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Book title", { exact: true }).fill("A new book");
  await page.getByRole("button", { name: "Create local book" }).click();
  await page.getByRole("button", { name: "Export EPUB", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Generate & download EPUB" }),
  ).toBeDisabled();
  await expect(
    page.getByText("The author name is missing.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("This section has no readable text.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Publication author", { exact: true })
    .fill("A. Writer");
  await page.getByLabel("Language tag", { exact: true }).fill("en-US");
  await page.getByRole("button", { name: "Save book details" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  await page.getByRole("button", { name: "Manuscript", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Chapter manuscript" })
    .fill("A complete opening.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Generate & download EPUB" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Language tag", { exact: true })).toHaveValue(
    "en-US",
  );
});
