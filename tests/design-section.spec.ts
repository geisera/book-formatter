import {test,expect} from "@playwright/test";

test("Design selects a section and saves its contextual formatting",async({page})=>{
  await page.goto("/");
  await page.getByLabel("Book title",{exact:true}).fill("Section design");
  await page.getByLabel("Author name",{exact:true}).fill("Author");
  await page.getByRole("button",{name:"Create local book"}).click();
  await page.getByRole("button",{name:"Structure",exact:true}).click();
  await page.getByLabel("New section type").selectOption("chapter");
  await page.getByLabel("Section title").fill("Second Chapter");
  await page.getByRole("button",{name:"+ Add section"}).click();
  await page.getByRole("button",{name:"Design",exact:true}).click();
  await page.getByLabel("Design section").selectOption({index:1});
  await expect(page.getByRole("heading",{name:"Second Chapter",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Paperback",exact:true}).click();
  await page.getByLabel("Design section start").selectOption("verso");
  await page.getByLabel("Design section header").selectOption("hide");
  await page.getByLabel("Design section spacing before").fill("25");
  await expect(page.getByLabel("Design section start")).toHaveValue("verso");
  await page.getByRole("button",{name:"Ebook",exact:true}).click();
  await page.getByRole("button",{name:"Paperback",exact:true}).click();
  await expect(page.getByLabel("Design section start")).toHaveValue("verso");
  await page.getByRole("button",{name:"Restore section defaults"}).click();
  await expect(page.getByLabel("Design section start")).toHaveValue("recto");
});
