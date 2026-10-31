import {describe,it,expect} from "vitest";
import {analyzePrintPages} from "../lib/print-quality";
import type {PageProof} from "../lib/print";
const page=(n:number,kind:PageProof["kind"],lines:number):PageProof=>({
 page:n,kind,left:40,right:300,lineCount:lines,minX:40,maxX:300,minY:40,maxY:500
});
describe("print page-quality audit",()=>{
 it("pairs actual even-left/odd-right facing pages",()=>{
  const pages=[page(1,"title",0),page(2,"body",30),page(3,"body",12),page(4,"body",28),page(5,"body",27)];
  const audit=analyzePrintPages(pages);
  expect(audit.unevenFacingSpreads).toEqual([{left:2,right:3,lineDelta:18}]);
 });
 it("does not flag blanks or chapter-opening pages as sparse body pages",()=>{
  const pages=[page(1,"title",0),page(2,"blank",0),page(3,"chapter",2),page(4,"body",4),page(5,"body",24)];
  expect(analyzePrintPages(pages).sparseBodyPages).toEqual([{page:4,lines:4}]);
 });
});
