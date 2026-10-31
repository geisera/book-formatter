import { test, expect } from "@playwright/test";

test("Structure compact rows support insertion, settings and persistence", async ({page}) => {
  await page.goto("/");
  await page.getByLabel("Book title", {exact:true}).fill("Compact structure test");
  await page.getByLabel("Author name", {exact:true}).fill("Example Author");
  await page.getByRole("button", {name:"Create local book"}).click();
  await page.getByRole("button", {name:"Structure", exact:true}).click();
  await expect(page.locator(".structure-compact-row")).toHaveCount(1);
  await page.getByRole("button", {name:"Chapter One",exact:true}).click();
  await expect(page.getByLabel("Type of Chapter One")).toBeVisible();
  await expect(page.getByRole("button",{name:"Split…"})).toBeDisabled();
  await expect(page.getByRole("button",{name:"Merge next"})).toBeDisabled();
  await expect(page.locator(".print-only-badge")).toContainText("Print only");
  await page.locator(".structure-group").filter({hasText:"Body matter"}).getByRole("button",{name:"+ Add here"}).first().click();
  await page.getByLabel("New section title").fill("Opening");
  await page.getByRole("button",{name:"Add section",exact:true}).click();
  await expect(page.locator(".structure-row-title")).toHaveText(["Opening","Chapter One"]);
  await page.reload();
  await page.locator(".book-card").filter({hasText:"Compact structure test"}).click();
  await page.getByRole("button",{name:"Structure",exact:true}).click();
  await expect(page.locator(".structure-row-title")).toHaveText(["Opening","Chapter One"]);
});

test("Structure adds a front matter section in its matter group",async({page})=>{
  await page.goto("/");
  await page.getByLabel("Book title",{exact:true}).fill("Matter placement test");
  await page.getByLabel("Author name",{exact:true}).fill("Example Author");
  await page.getByRole("button",{name:"Create local book"}).click();
  await page.getByRole("button",{name:"Structure",exact:true}).click();
  await page.locator(".structure-group").filter({hasText:"Front matter"}).getByRole("button",{name:"+ Add here"}).first().click();
  await page.getByLabel("New section type").selectOption("dedication");
  await page.getByLabel("New section title").fill("For my readers");
  await page.getByRole("button",{name:"Add section",exact:true}).click();
  await expect(page.locator(".structure-row-title")).toHaveText(["For my readers","Chapter One"]);
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

test("Details language dropdown preserves custom BCP-47 tags",async({page})=>{
  await page.goto("/");
  await page.getByLabel("Book title",{exact:true}).fill("Languages test");
  await page.getByLabel("Author name",{exact:true}).fill("Author");
  await page.getByRole("button",{name:"Create local book"}).click();
  await page.getByRole("button",{name:"Details",exact:true}).click();
  await expect(page.getByLabel("Book language")).toHaveValue("en");
  await page.getByLabel("Book language").selectOption("fr");
  await page.getByRole("button",{name:"Save book details"}).click();
  await expect(page.getByText("Book details saved locally.")).toBeVisible();
  await page.getByLabel("Book language").selectOption("custom");
  await page.getByLabel("Custom language tag").fill("en-CA");
  await page.getByRole("button",{name:"Save book details"}).click();
  await page.reload();
  await page.locator(".book-card").filter({hasText:"Languages test"}).click();
  await page.getByRole("button",{name:"Details",exact:true}).click();
  await expect(page.getByLabel("Book language")).toHaveValue("custom");
  await expect(page.getByLabel("Custom language tag")).toHaveValue("en-CA");
});

test("mobile workspace exposes sections drawer and bottom navigation",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/");
  await page.getByLabel("Book title",{exact:true}).fill("Responsive test");
  await page.getByLabel("Author name",{exact:true}).fill("Author");
  await page.getByRole("button",{name:"Create local book"}).click();
  await expect(page.getByRole("navigation",{name:"Mobile workspace navigation"})).toBeVisible();
  const toggle=page.getByRole("button",{name:"Sections",exact:false}).first();
  await expect(toggle).toHaveAttribute("aria-expanded","false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded","true");
  await expect(page.getByRole("complementary",{name:"Manuscript sections"})).toBeVisible();
  await page.getByRole("button",{name:"Close manuscript drawer"}).click();
  await expect(toggle).toHaveAttribute("aria-expanded","false");
  await page.getByRole("navigation",{name:"Mobile workspace navigation"}).getByRole("button",{name:"Structure"}).click();
  await expect(page.getByRole("region",{name:"Book structure editor"})).toBeVisible();
});
