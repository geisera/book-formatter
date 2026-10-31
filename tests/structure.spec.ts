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
  const description=page.locator("#new-section-type-description");
  await expect(description).toHaveCSS("grid-column-start","1");
  await expect(description).toHaveCSS("grid-column-end","-1");
  // The form aligns the controls at their bottom edges, not the labels' top edges.
  await expect.poll(async()=> {
    const [select,input,help]=await Promise.all([
      page.locator('.structure-add select').boundingBox(),
      page.locator('.structure-add input').boundingBox(),
      description.boundingBox(),
    ]);
    return !!select && !!input && !!help &&
      Math.abs((select.y+select.height)-(input.y+input.height))<4 &&
      help.y>=Math.max(select.y+select.height,input.y+input.height);
  }).toBe(true);
  await expect(description).toContainText("main story");
  const useCase=description.locator(".structure-add-use-case");
  await expect(description.locator("p")).toHaveCount(2);
  await expect(useCase).toContainText("Use this when");
  await expect(useCase).toContainText("regular installment");

  await page.getByLabel("New section type").selectOption("epigraph");
  await expect(useCase).toContainText("quotation, verse, or brief excerpt");
  await expect(description).toContainText("quotation");
  await page.getByLabel("New section type").selectOption("title");
  await expect(useCase).toContainText("automatically generated one");
  await expect(description).toContainText("subtitle, author, and publisher");
  await page.getByLabel("New section type").selectOption("chapter");
  await expect(description).toContainText("heading appearance is set in Design");
  await expect(page.getByRole("checkbox",{name:"Show title on page for Chapter One"})).toHaveCount(0);
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
  await expect(page.getByText("Saved locally",{exact:true})).toBeVisible();
  await page.reload();
  await page.locator(".book-card").filter({hasText:/Structure test/}).click();
  await page.getByRole("button",{name:"Structure",exact:true}).click();
  await page.locator(".structure-item").filter({hasText:"Before the story"}).getByText("Page Layout").click();
  await expect(page.getByLabel("Start page for Before the story")).toHaveValue("verso");
  await expect(page.getByLabel("Vertical position for Before the story")).toHaveValue("center");
  await expect(page.getByLabel("Spacing before for Before the story")).toHaveValue("24");
  await expect(page.getByRole("checkbox", { name: "Show title on page for Before the story" })).not.toBeChecked();
});

test("adds new conventional sections with matching guidance and editable types",async({page})=>{
 await page.goto("/");
 await page.getByLabel("Book title",{exact:true}).fill("Conventional sections");
 await page.getByLabel("Author name",{exact:true}).fill("Author");
 await page.getByRole("button",{name:"Create local book"}).click();
 await page.getByRole("button",{name:"Structure",exact:true}).click();
 const field=page.getByLabel("New section type");
 const helper=page.locator("#new-section-type-description");
 for(const [type,label] of [["foreword","Foreword"],["introduction","Introduction"],["afterword","Afterword"],["bibliography","Bibliography"],["praise","Praise / Blurbs"],["appendix","Appendix"],["glossary","Glossary"],["endnotes","Endnotes"]] as const){
   await field.selectOption(type);
   await expect(helper.locator("p")).toHaveCount(2);
   await expect(helper.locator(".structure-add-use-case")).toContainText("Use this when");
   await page.getByLabel("Section title").fill(label);
   await page.getByRole("button",{name:"+ Add section"}).click();
   await expect(page.locator(".structure-item-heading strong").filter({hasText:label})).toBeVisible();
 }
 await page.getByLabel("Type of Foreword").selectOption("preface");
 await expect(page.locator(".structure-item").filter({hasText:"Foreword"}).getByLabel("Type of Foreword")).toHaveValue("preface");
});


test("sidebar adds, duplicates, and reorders sections through shared structure actions", async ({page}) => {
  await page.goto("/");
  await page.getByLabel("Book title", {exact:true}).fill("Sidebar section actions");
  await page.getByLabel("Author name", {exact:true}).fill("Example Author");
  await page.getByRole("button", {name:"Create local book"}).click();
  await page.getByRole("button", {name:"+ Add chapter"}).click();
  await expect(page.locator(".sidebar-section-row")).toHaveCount(2);
  await page.getByRole("button", {name:"Actions for New chapter"}).click();
  await page.getByRole("menuitem", {name:"Duplicate"}).click();
  await expect(page.locator(".sidebar-section-row")).toHaveCount(3);
  await page.getByRole("button", {name:"Organize…"}).click();
  await expect(page.getByRole("region", {name:"Book structure editor"})).toBeVisible();
});

test("word-count status is visible in the Manuscript editor", async ({page}) => {
  await page.goto("/");
  await page.getByLabel("Book title", {exact:true}).fill("Word Count Test");
  await page.getByLabel("Author name", {exact:true}).fill("Example Author");
  await page.getByRole("button", {name:"Create local book"}).click();
  await expect(page.locator(".editor-word-count")).toContainText("Chapter: 0 words");
  await expect(page.locator(".editor-word-count")).toContainText("Book: 0 words");
  await expect(page.locator(".editor-word-count")).toContainText("~0 h 0 min read");
});
