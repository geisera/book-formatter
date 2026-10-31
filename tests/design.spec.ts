import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";

test("formats an imported manuscript offline and restores text plus design in a fresh profile", async ({
  page,
  context,
  browser,
}) => {
  await page.goto("/");
  await expect(page.getByText("Offline app ready")).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Import a manuscript" }).click();
  await page.getByLabel("Manuscript file").setInputFiles({
    name: "design.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# The Last Light\n\nThe **golden** lantern waited.\n\nAnother paragraph, unchanged.\n\n***\n\nA new scene.\n\n# Elsewhere\n\nThe second chapter.",
    ),
  });
  await expect(page.getByLabel("Section 2 title", { exact: true })).toHaveValue(
    "Elsewhere",
  );
  await page.getByLabel("Imported book title").fill("A designed book");
  await page.getByRole("button", { name: "Import as new book" }).click();
  const preview = page.getByRole("region", {
    name: "Ebook preview",
    exact: true,
  });
  await expect(
    preview.getByRole("article", { name: "Formatted chapter" }),
  ).toContainText("The golden lantern waited.");
  const baselineDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const initialPath = await (await baselineDownload).path();
  const baseline = JSON.parse(
    strFromU8(
      unzipSync(new Uint8Array(await readFile(initialPath!)))[
        "manuscript.json"
      ],
    ),
  );
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page
    .getByRole("slider", { name: "Body size", exact: true })
    .press("End");
  await page
    .getByRole("slider", { name: "Line spacing", exact: true })
    .press("End");
  await page
    .getByRole("slider", { name: "First-line indent", exact: true })
    .press("End");
  await page
    .getByRole("slider", { name: "Paragraph spacing", exact: true })
    .press("End");
  await page
    .getByLabel("Chapter heading", { exact: true })
    .selectOption("left");
  await page
    .getByLabel("Scene ornament", { exact: true })
    .selectOption("diamonds");
  await page
    .getByRole("slider", { name: "Chapter opening space", exact: true })
    .press("End");
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  await expect(preview.getByRole("article")).toHaveCSS("font-size", "24px");
  await expect(preview.getByRole("article")).toHaveCSS("line-height", "52.8px");
  await expect(
    preview.getByRole("heading", { name: "The Last Light", exact: true }),
  ).toHaveCSS("text-align", "left");
  await expect(
    preview.getByRole("separator", { name: "Scene break" }),
  ).toHaveText("◆ ◆ ◆");
  await expect(preview.locator(".ebook-prose p").nth(0)).toHaveCSS(
    "text-indent",
    "0px",
  );
  await expect(preview.locator(".ebook-prose p").nth(1)).toHaveCSS(
    "text-indent",
    "72px",
  );
  await expect(preview.locator(".ebook-prose p").nth(2)).toHaveCSS(
    "text-indent",
    "0px",
  );
  await page.getByLabel("Reading width", { exact: true }).selectOption("320");
  await page.getByLabel("Preview theme", { exact: true }).selectOption("dark");
  await page
    .getByRole("button", { name: "Increase preview text size" })
    .click();
  await expect(preview.getByRole("article")).toHaveCSS("font-size", "26.4px");
  expect(
    await page.evaluate(async () => {
      await document.fonts.load('17px "Libre Baskerville"');
      await document.fonts.load('italic 17px "Libre Baskerville"');
      return (
        document.fonts.check('17px "Libre Baskerville"') &&
        document.fonts.check('italic 17px "Libre Baskerville"')
      );
    }),
  ).toBe(true);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const path = await (await download).path();
  const saved = JSON.parse(
    strFromU8(
      unzipSync(new Uint8Array(await readFile(path!)))["manuscript.json"],
    ),
  );
  expect(saved.chapters).toEqual(baseline.chapters);
  expect(saved.editions.ebook).toMatchObject({
    fontSize: 24,
    lineHeight: 2.2,
    paragraphIndent: 3,
    paragraphSpacing: 1.5,
    headingStyle: "left",
    sceneOrnament: "diamonds",
    chapterSpacing: 5,
  });
  expect(saved.editions.ebook).not.toHaveProperty("theme");
  await page.reload();
  await page.locator(".book-card").filter({hasText:/A designed book/}).click();
  await expect(
    page.getByRole("article", { name: "Formatted chapter" }),
  ).toHaveCSS("font-size", "24px");
  await page.getByRole("button", { name: "Next preview chapter" }).click();
  await expect(
    page.getByRole("article", { name: "Formatted chapter" }),
  ).toContainText("The second chapter.");
  const clean = await browser.newContext();
  const restored = await clean.newPage();
  await restored.goto("/");
  await expect(restored.getByText("Offline app ready")).toBeVisible();
  await clean.setOffline(true);
  await restored.locator('input[accept=".zip"]').setInputFiles(path!);
  await expect(
    restored.getByRole("article", { name: "Formatted chapter" }),
  ).toHaveCSS("font-size", "24px");
  await expect(
    restored.getByRole("article", { name: "Formatted chapter" }),
  ).toContainText("A new scene.");
  await restored.getByRole("button", { name: "Design", exact: true }).click();
  await expect(
    restored.getByLabel("Scene ornament", { exact: true }),
  ).toHaveValue("diamonds");
  await expect(
    restored.getByRole("slider", { name: "Line spacing", exact: true }),
  ).toHaveValue("2.2");
  await clean.close();
});

test("live preview follows edits and changing modes preserves undo history", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Book title", { exact: true }).fill("Live story");
  await page.getByRole("button", { name: "Create local book" }).click();
  const editor = page.getByRole("textbox", { name: "Chapter manuscript" });
  await editor.fill("The first sentence.");
  await expect(
    page.getByRole("article", { name: "Formatted chapter" }),
  ).toContainText("The first sentence.");
  await editor.press("End");
  await editor.pressSequentially(" More words.");
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByRole("button", { name: "Manuscript", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(editor).not.toContainText("More words.");
  await expect(page.locator(".ebook-prose")).toHaveText(
    (await editor.textContent()) ?? "",
  );
});
