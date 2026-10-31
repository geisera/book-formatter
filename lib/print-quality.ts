import type {PageProof} from "./print";
export type PrintQualityReport={
 sparseBodyPages:{page:number;lines:number}[];
 unevenFacingSpreads:{left:number;right:number;lineDelta:number}[];
};
export function analyzePrintPages(pages:readonly PageProof[],minimumLines=8,maxSpreadDelta=8):PrintQualityReport{
 const sparseBodyPages=pages.filter(p=>p.kind==="body"&&p.lineCount>0&&p.lineCount<minimumLines)
  .map(p=>({page:p.page,lines:p.lineCount}));
 const unevenFacingSpreads:PrintQualityReport["unevenFacingSpreads"]=[];
 // Physical spreads pair even left-hand pages with odd right-hand pages,
 // not consecutive (1,2) sheets.
 for(let pageNo=2;pageNo<pages.length;pageNo+=2){
   const left=pages[pageNo-1],right=pages[pageNo];
   if(left?.kind==="body"&&right?.kind==="body"){
     const lineDelta=Math.abs(left.lineCount-right.lineCount);
     if(lineDelta>maxSpreadDelta)unevenFacingSpreads.push({left:left.page,right:right.page,lineDelta});
   }
 }
 return {sparseBodyPages,unevenFacingSpreads};
}
