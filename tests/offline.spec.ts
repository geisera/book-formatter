import {test,expect} from "@playwright/test";
test("edits survive offline restart and backup restores in a fresh profile",async({page,context,browser})=>{
 await page.goto("/");await expect(page.getByText("Offline app ready")).toBeVisible();
 await page.getByLabel("Book title",{exact:true}).fill("Offline novel");await page.getByLabel("Author name").fill("Tony");await page.getByRole("button",{name:"Create local book"}).click();
 await page.getByRole("textbox",{name:"Chapter manuscript"}).fill("First chapter survives.");await page.getByRole("button",{name:"Add chapter"}).click();await page.getByRole("textbox",{name:"Chapter manuscript"}).fill("Second chapter survives.");await expect(page.getByRole("status")).toHaveText("Saved locally");
 await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await page.close();const reopened=await context.newPage();await reopened.goto("/");await reopened.getByRole("button",{name:/Offline novel/}).click();await expect(reopened.getByRole("textbox",{name:"Chapter manuscript"})).toHaveText("First chapter survives.");await reopened.getByRole("button",{name:"02 Chapter 2"}).click();await expect(reopened.getByRole("textbox",{name:"Chapter manuscript"})).toHaveText("Second chapter survives.");
 const download=reopened.waitForEvent("download");await reopened.getByRole("button",{name:"Download backup"}).click();const path=await (await download).path();expect(path).toBeTruthy();
 const clean=await browser.newContext();const restored=await clean.newPage();await restored.goto("/");await restored.locator('input[type="file"]').setInputFiles(path!);await expect(restored.getByRole("textbox",{name:"Chapter manuscript"})).toHaveText("First chapter survives.");await clean.close();
});
