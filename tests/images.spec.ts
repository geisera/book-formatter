import { test, expect } from "@playwright/test";

const pngA = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAF0lEQVR4nGM0ckthIAUwkaR6VMMI0gAAFWAA9Kg1bTEAAAAASUVORK5CYII=";
const pngB = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO0HLZkAAAAASUVORK5CYII=";

test("edits image properties and replaces image without losing its caption", async ({page}) => {
 await page.goto("/");
 await page.getByLabel("Book title",{exact:true}).fill("Illustrated book");
 await page.getByLabel("Author name",{exact:true}).fill("Test Author");
 await page.getByRole("button",{name:"Create local book"}).click();
 page.once("dialog", dialog => dialog.accept("A city map"));
 await page.getByLabel("Choose manuscript image").setInputFiles({
  name:"first.png",mimeType:"image/png",buffer:Buffer.from(pngA,"base64")
 });
 const panel=page.getByRole("region",{name:"Image properties"});
 await expect(panel).toBeVisible();
 await expect(panel).toHaveCSS("position","fixed");
 await panel.getByRole("button",{name:"Close"}).click();
 await expect(panel).not.toBeVisible();
 await page.locator(".ProseMirror figure.manuscript-image img").click();
 await expect(panel).toBeVisible();
 await expect(page.locator(".ProseMirror figure.manuscript-image")).toHaveClass(/ProseMirror-selectednode/);
 const buttons=panel.locator(".image-properties-actions button");
 await expect(buttons).toHaveCount(3);
 const positions=await buttons.evaluateAll(elements=>elements.map(el=>Math.round(el.getBoundingClientRect().top)));
 expect(new Set(positions).size).toBe(1);
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 await expect(panel).toBeInViewport();
 await panel.getByLabel("Image width").selectOption("50");
 await panel.getByLabel("Image alignment").selectOption("right");
 await panel.getByLabel("Image alternative text").fill("A map of the city");
 await panel.getByLabel("Image caption").fill("Figure 1: City map.");
 await panel.getByRole("button",{name:"Save properties"}).click();
 const image=page.locator(".ProseMirror figure.manuscript-image");
 await expect(image.locator("figcaption")).toHaveText("Figure 1: City map.");
 await expect(image.locator("img")).toHaveAttribute("alt","A map of the city");
 await expect(image.locator("img")).toHaveAttribute("style",/width:\s*50%/);
 await expect(image).toHaveAttribute("style",/text-align:\s*right/);
 await panel.getByLabel("Replacement image file").setInputFiles({
  name:"replacement.png",mimeType:"image/png",buffer:Buffer.from(pngB,"base64")
 });
 await expect(image.locator("img")).toHaveAttribute("src",`data:image/png;base64,${pngB}`);
 await expect(image.locator("figcaption")).toHaveText("Figure 1: City map.");
 await expect(image.locator("img")).toHaveAttribute("alt","A map of the city");
 await panel.getByRole("button",{name:"Remove image"}).click();
 await expect(page.locator(".ProseMirror figure.manuscript-image")).toHaveCount(0);
});
