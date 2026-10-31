/** Decide whether to move a short run of whole paragraphs to the next facing page.
 * Only moves a section's final 2–4 paragraphs; the caller verifies that a
 * following page is already unavoidable and that the complete tail fits there.
 * This never moves material across a chapter boundary. */
export function shouldBalanceParagraphTail(input:{
  page:number; kind:string; writtenLines:number; remainingSlots:number;
  nextPageSlots:number; tailLines:number; tailParagraphs:number;
  firstParagraphLines:number;
}):boolean{
 const {page,kind,writtenLines,remainingSlots,nextPageSlots,tailLines,tailParagraphs,firstParagraphLines}=input;
 if(page%2!==0||kind!=="body"||writtenLines<8)return false;
 if(tailParagraphs<2||tailParagraphs>4||tailLines>18)return false;
 if(firstParagraphLines<1||firstParagraphLines>8||firstParagraphLines>remainingSlots)return false;
 if(tailLines<=remainingSlots||tailLines>nextPageSlots)return false;
 // Never leave a near-empty left leaf merely to tidy the right leaf.
 if(writtenLines<tailLines||writtenLines<12)return false;
 const beforeLeft=writtenLines+remainingSlots;
 const beforeRight=tailLines-remainingSlots;
 const afterLeft=writtenLines;
 const afterRight=tailLines;
 return Math.abs(afterLeft-afterRight)+3<Math.abs(beforeLeft-beforeRight);
}
