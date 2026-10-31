import {test,expect} from "@playwright/test";
const png="iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAF0lEQVR4nGM0ckthIAUwkaR6VMMI0gAAFWAA9Kg1bTEAAAAASUVORK5CYII=";
test("cover upload persists and appears in live ebook preview",async ({page})=>{
 await page.goto("/");
 await page.getByLabel("Book title",{exact:true}).fill("Cover test book");
 await page.getByLabel("Author name",{exact:true}).fill("Test Author");
 await page.getByRole("button",{name:"Create local book"}).click();
 await page.getByRole("button",{name:"Design",exact:true}).click();
 const settings=page.getByRole("region",{name:"EPUB cover settings"});
 await settings.getByLabel("Choose EPUB cover image").setInputFiles({
  name:"cover.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")
 });
 await expect(settings.getByText("Current book cover")).toBeVisible();
 await settings.getByLabel("Cover alternative text").fill("A tower on the cover");
 await page.getByRole("group",{name:"Preview page"}).getByRole("button",{name:"Cover"}).click();
 await expect(page.locator(".ebook-cover-preview img")).toHaveAttribute("alt","A tower on the cover");
 await page.getByRole("button",{name:"← Bookshelf"}).click();
 await page.locator(".book-card").filter({hasText:/Cover test book/}).click();
 await page.getByRole("button",{name:"Design",exact:true}).click();
 await expect(page.getByRole("region",{name:"EPUB cover settings"}).getByLabel("Cover alternative text")).toHaveValue("A tower on the cover");
 await settings.getByRole("button",{name:"Remove cover"}).click();
 await expect(settings.getByRole("button",{name:"Upload cover"})).toBeVisible();
});
