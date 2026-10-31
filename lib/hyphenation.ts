import {EN_US_PATTERNS,EN_GB_PATTERNS} from "./hyphen-patterns";
export type HyphenationLanguage="en-us"|"en-gb";
type Pattern={letters:string;values:number[]};
const caches=new Map<HyphenationLanguage,Map<string,Pattern[]>>();
function patternMap(locale:HyphenationLanguage){
 const cached=caches.get(locale);if(cached)return cached;
 const map=new Map<string,Pattern[]>();
 for(const raw of (locale==="en-gb"?EN_GB_PATTERNS:EN_US_PATTERNS).split(/\s+/)){
   if(!raw)continue;
   const letters=raw.replace(/\d/g,"");
   const values=Array(letters.length+1).fill(0) as number[];
   let at=0;
   for(const c of raw){if(/\d/.test(c))values[at]=Number(c);else at++;}
   const key=letters.charAt(0);
   map.set(key,[...(map.get(key)??[]),{letters,values}]);
 }
 caches.set(locale,map);return map;
}
/** Liang/TeX language-pattern breaks, as character indices. Never alters source text. */
export function hyphenationPoints(word:string,locale:HyphenationLanguage="en-us",exceptions:ReadonlySet<string>=new Set()):number[]{
 if(word.length<7 || !/^[a-z]+$/i.test(word) || exceptions.has(word.toLowerCase()))return [];
 const text="."+word.toLowerCase()+".";
 const scores=new Uint8Array(text.length+1);
 const map=patternMap(locale);
 for(let i=0;i<text.length;i++){
   for(const p of map.get(text[i])??[]){
     if(!text.startsWith(p.letters,i))continue;
     for(let j=0;j<p.values.length;j++)scores[i+j]=Math.max(scores[i+j],p.values[j]);
   }
 }
 const points:number[]=[];
 for(let i=2;i<=word.length-3;i++)if(scores[i+1]%2)points.push(i);
 return points;
}
