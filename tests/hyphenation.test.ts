import {describe,it,expect} from "vitest";
import {hyphenationPoints} from "../lib/hyphenation";
describe("offline TeX hyphenation",()=>{
 it("finds permitted break positions in English",()=>{
   const us=hyphenationPoints("hyphenation","en-us");
   expect(us.length).toBeGreaterThan(0);
   for(const pos of us){expect(pos).toBeGreaterThanOrEqual(2);expect(pos).toBeLessThanOrEqual("hyphenation".length-3);}
 });
 it("honors protected names, punctuation, and short words",()=>{
   expect(hyphenationPoints("hyphenation","en-us",new Set(["hyphenation"]))).toEqual([]);
   expect(hyphenationPoints("Mister-Sorn")).toEqual([]);
   expect(hyphenationPoints("small")).toEqual([]);
 });
 it("supports offline UK English patterns",()=>{
   expect(hyphenationPoints("internationalization","en-gb").length).toBeGreaterThan(0);
 });
});
