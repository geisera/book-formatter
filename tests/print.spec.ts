import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { checksum } from "../lib/epub";

test("builds, previews and downloads the same PDF offline and preserves profile in backup", async ({
  page,
  context,
}) => {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (
      (request.method() !== "GET" && request.method() !== "HEAD") ||
      new URL(request.url()).origin !== "http://127.0.0.1:3100"
    )
      sent.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByText("Offline app ready")).toBeVisible();
  await context.setOffline(true);
  await page
    .getByLabel("Book title", { exact: true })
    .fill("Offline print proof");
  await page.getByLabel("Author name", { exact: true }).fill("Test Author");
  await page.getByRole("button", { name: "Create local book" }).click();
  await page
    .getByRole("textbox", { name: "Chapter manuscript" })
    .fill("The lantern lit the room. ".repeat(500));
  await page.getByRole("button", { name: "Add chapter" }).click();
  await page
    .getByRole("textbox", { name: "Chapter manuscript" })
    .fill("The second chapter begins on a right-hand page. ".repeat(120));
  await expect(page.getByRole("status")).toHaveText("Saved locally");
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.getByRole("button", { name: "Build 6 × 9 PDF proof" }).click();
  await expect(
    page.getByRole("button", { name: "Download PDF proof" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator('canvas[data-rendered="true"]')).toHaveCount(1, {
    timeout: 30000,
  });
  const dimensions = await page
    .locator('canvas[data-rendered="true"]')
    .evaluate((canvas) => ({
      width: (canvas as HTMLCanvasElement).width,
      height: (canvas as HTMLCanvasElement).height,
    }));
  expect(dimensions.width / dimensions.height).toBeCloseTo(2 / 3, 2);
  await page.getByLabel("Print page", { exact: true }).fill("3");
  await expect(page.locator('canvas[data-rendered="true"]')).toHaveCount(2, {
    timeout: 30000,
  });
  await expect(
    page.getByText("Page 3 · Chapter opening", { exact: true }),
  ).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF proof" }).click();
  const path = await (await downloading).path();
  const bytes = new Uint8Array(await readFile(path!));
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount() % 2).toBe(0);
  for (const p of pdf.getPages())
    expect(p.getSize()).toEqual({ width: 432, height: 648 });
  await mkdir("artifacts/print", { recursive: true });
  await writeFile("artifacts/print/browser-proof.pdf", bytes);
  // History fingerprint must identify the exact PDF bytes downloaded from the preview result.
  await page.getByText(/Local print history/).click();
  await expect(page.getByText(checksum(bytes), { exact: true })).toBeVisible();
  expect(sent).toEqual([]);
  const backup = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  expect(await (await backup).path()).toBeTruthy();
  await page.reload();
  await page.locator(".book-card").filter({hasText:/Offline print proof/}).click();
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.getByText(/Local print history/).click();
  await expect(page.getByText(checksum(bytes), { exact: true })).toBeVisible();
});

test("imports and builds a full-length novel with no network and proves the actual browser PDF", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expect(page.getByText("Offline app ready")).toBeVisible();
  await context.setOffline(true);
  const paragraph =
    "The road wound past the old stone tower, where morning light fell across the river. A traveller paused beside the gate and listened to the distant bells. Beyond the wall, the market was waking, its voices carried by the cool air. The journey would begin with a promise, and end somewhere that no map could name. ";
  const manuscript = Array.from(
    { length: 40 },
    (_, i) =>
      `# Chapter ${i + 1}: The Road Ahead\n\n` +
      Array.from(
        { length: 25 },
        (_, j) => `Passage ${i + 1}-${j + 1}. ` + paragraph.repeat(2),
      ).join("\n\n"),
  ).join("\n\n");
  await page.getByRole("button", { name: "Import a manuscript" }).click();
  await page.getByLabel("Manuscript file").setInputFiles({
    name: "novel.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(manuscript),
  });
  await expect(
    page.getByLabel("Section 40 title", { exact: true }),
  ).toHaveValue("Chapter 40: The Road Ahead");
  await page.getByLabel("Imported book title").fill("The Offline Lantern Road");
  await page.getByLabel("Imported author name").fill("Test Author");
  await page.getByRole("button", { name: "Import as new book" }).click();
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.getByRole("button", { name: "Build 6 × 9 PDF proof" }).click();
  await expect(
    page.getByRole("button", { name: "Download PDF proof" }),
  ).toBeVisible({ timeout: 90000 });
  await expect(page.locator('canvas[data-rendered="true"]')).toHaveCount(1, {
    timeout: 30000,
  });
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF proof" }).click();
  const path = await (await downloading).path();
  const bytes = await readFile(path!);
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(200);
  const saved = await page.evaluate(
    () =>
      new Promise<{ book: unknown; record: unknown }>((resolve, reject) => {
        const request = indexedDB.open("book-formatter");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction(
            ["books", "printExports"],
            "readonly",
          );
          const books = tx.objectStore("books").getAll(),
            records = tx.objectStore("printExports").getAll();
          tx.oncomplete = () => {
            database.close();
            resolve({ book: books.result[0], record: records.result[0] });
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await mkdir("artifacts/print", { recursive: true });
  await writeFile("artifacts/print/browser-novel.pdf", bytes);
  await writeFile(
    "artifacts/print/browser-novel.json",
    JSON.stringify(saved.record),
  );
  await writeFile(
    "artifacts/print/browser-novel-source.json",
    JSON.stringify(saved.book),
  );
});

test("inherits print templates from Design and preserves print justification offline", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByText("Offline app ready")).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel("Book title", { exact: true }).fill("Template selection");
  await page.getByLabel("Author name", { exact: true }).fill("Test Author");
  await page.getByRole("button", { name: "Create local book" }).click();
  await page.getByRole("textbox", { name: "Chapter manuscript" }).fill("An opening scene. ".repeat(90));

  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByRole("button", { name: /Modern.*Contemporary/i }).click();
  await expect(page.getByRole("status").filter({ hasText: /Saved locally/ })).toBeVisible();
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await expect(page.getByRole("heading",{name:"Modern paperback"})).toBeVisible();
  await expect(page.getByLabel("Print template")).toHaveCount(0);
  await page.getByLabel("Justify body text").check();

  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByRole("button", { name: /Gothic.*Ornamental/i }).click();
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await expect(page.getByRole("heading",{name:"Gothic paperback"})).toBeVisible();
  await expect(page.getByLabel("Justify body text")).toBeChecked();
  await expect(page.getByRole("status").filter({ hasText: /Saved locally/ })).toBeVisible();
  await page.getByRole("button", { name: "Build 6 × 9 PDF proof" }).click();
  await expect(page.getByRole("button", { name: "Download PDF proof" })).toBeVisible({ timeout: 30000 });
  await page.reload();
  await page.locator(".book-card").filter({hasText:/Template selection/}).click();
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await expect(page.getByRole("heading",{name:"Gothic paperback"})).toBeVisible();
  await expect(page.getByLabel("Justify body text")).toBeChecked();
});

test("prints the selected front cover as the first page with fresh and offline workers", async ({page,context}) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expect(page.getByText("Offline app ready")).toBeVisible();
  await page.getByLabel("Book title",{exact:true}).fill("Cover PDF proof");
  await page.getByLabel("Author name",{exact:true}).fill("Test Author");
  await page.getByRole("button",{name:"Create local book"}).click();
  await page.getByRole("textbox",{name:"Chapter manuscript"}).fill("A chapter of manuscript text. ".repeat(90));
  await page.getByRole("button",{name:"Design",exact:true}).click();
  await page.getByLabel("Choose EPUB cover image").setInputFiles({
    name:"front.png",mimeType:"image/png",
    buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAF0lEQVR4nGM0ckthIAUwkaR6VMMI0gAAFWAA9Kg1bTEAAAAASUVORK5CYII=","base64"),
  });
  await expect(page.getByText("Current book cover")).toBeVisible();
  await expect(page.getByRole("status").filter({hasText:"Saved locally"})).toBeVisible();
  await page.getByRole("button",{name:"Print",exact:true}).click();
  const checkbox=page.getByLabel("Include front cover");
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await context.setOffline(true);
  await page.getByRole("button",{name:"Build 6 × 9 PDF proof"}).click();
  await expect(page.getByRole("button",{name:"Download PDF proof"})).toBeVisible({timeout:60000});
  await expect(page.getByText("Page 1 · Front cover")).toBeVisible({timeout:30000});
  const download=page.waitForEvent("download");
  await page.getByRole("button",{name:"Download PDF proof"}).click();
  const artifact=await download;
  expect(artifact.suggestedFilename()).toContain("-with-cover-");
  const pdf=await PDFDocument.load(new Uint8Array(await readFile((await artifact.path())!)));
  expect(pdf.getPageCount()).toBeGreaterThan(2);
  await expect(page.getByText("Page 1 · Front cover")).toBeVisible();
});


test("saves trim selection and exports a correctly sized 5.5 × 8.5 trade paperback", async ({page,context})=>{
  await page.goto("/");
  await expect(page.getByText("Offline app ready")).toBeVisible();
  await page.getByLabel("Book title",{exact:true}).fill("Trade paperback");
  await page.getByLabel("Author name",{exact:true}).fill("Test Writer");
  await page.getByRole("button",{name:"Create local book"}).click();
  await page.getByRole("textbox",{name:"Chapter manuscript"}).fill("A chapter of text. ".repeat(120));
  await page.getByRole("button",{name:"Print",exact:true}).click();
  await expect(page.locator('input[name="print-trim"][value="6x9"]')).toBeChecked();
  await page.locator('input[name="print-trim"][value="5.5x8.5"]').check();
  await expect(page.getByText(/For most novels/)).toBeVisible();
  await expect(page.getByRole("status").filter({hasText:"Saved locally"})).toBeVisible();
  await page.getByRole("button",{name:"Design",exact:true}).click();
  await page.getByRole("button",{name:"Print",exact:true}).click();
  await expect(page.locator('input[name="print-trim"][value="5.5x8.5"]')).toBeChecked();
  await context.setOffline(true);
  await page.getByRole("button",{name:"Build 5.5 × 8.5 PDF proof"}).click();
  await expect(page.getByRole("button",{name:"Download PDF proof"})).toBeVisible({timeout:60000});
  await expect(page.locator('canvas[data-rendered="true"]')).toHaveCount(1);
  const download=page.waitForEvent("download");
  await page.getByRole("button",{name:"Download PDF proof"}).click();
  const file=await download;
  expect(file.suggestedFilename()).toContain("-5.5x8.5-proof.pdf");
  const pdf=await PDFDocument.load(await readFile((await file.path())!));
  expect(pdf.getPages().every(p=>p.getSize().width===396&&p.getSize().height===612)).toBe(true);
  await page.reload();
  await page.locator(".book-card").filter({hasText:"Trade paperback"}).click();
  await page.getByRole("button",{name:"Print",exact:true}).click();
  await expect(page.locator('input[name="print-trim"][value="5.5x8.5"]')).toBeChecked();
});
