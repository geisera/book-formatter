import {describe,it,expect} from "vitest";
import {shouldBalanceParagraphTail as balance} from "../lib/facing-balance";

const base={page:4,kind:"body",writtenLines:30,remainingSlots:9,
  nextPageSlots:40,tailLines:16,tailParagraphs:3,firstParagraphLines:5};

describe("whole-paragraph facing-page balancing",()=>{
 it("reduces estimated facing-page bottom differences only for a short multi-paragraph tail",()=>{
  expect(balance(base)).toBe(true);
  const before=Math.abs((base.writtenLines+base.remainingSlots)-(base.tailLines-base.remainingSlots));
  const after=Math.abs(base.writtenLines-base.tailLines);
  expect(after).toBeLessThan(before);
 });
 it("never inserts an unnecessary page or creates an oversized continuation",()=>{
  expect(balance({...base,tailLines:8})).toBe(false);
  expect(balance({...base,nextPageSlots:12})).toBe(false);
  expect(balance({...base,tailLines:22})).toBe(false);
 });
 it("preserves recto openings and refuses unsupported breaks and nearly empty verso pages",()=>{
  expect(balance({...base,page:3})).toBe(false);
  expect(balance({...base,kind:"chapter"})).toBe(false);
  expect(balance({...base,kind:"blank"})).toBe(false);
  expect(balance({...base,writtenLines:6})).toBe(false);
  expect(balance({...base,tailParagraphs:1})).toBe(false);
  expect(balance({...base,tailParagraphs:5})).toBe(false);
  expect(balance({...base,firstParagraphLines:10})).toBe(false);
 });
 it("declines changes that cannot improve balance enough",()=>{
  expect(balance({...base,writtenLines:15,tailLines:16})).toBe(false);
 });
});
