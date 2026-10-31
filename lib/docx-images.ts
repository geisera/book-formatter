import { unzipSync, strFromU8 } from "fflate";
import { decodeImage, MAX_PROJECT_IMAGES_BYTES } from "./images";
import type { ImportDraft, ImportBlock } from "./import-model";

/** Recover supported raster images directly from DOCX drawing references.
 * This does not permit linked, remote, or macro-embedded resources. */
export function recoverDocxImages(bytes: Uint8Array, draft: ImportDraft): ImportDraft {
  const selected = unzipSync(bytes, {filter: f =>
    f.name === "word/document.xml" ||
    f.name === "word/_rels/document.xml.rels" ||
    /^word\/media\/[^/]+\.(?:png|jpe?g)$/i.test(f.name)
  });
  const document = selected["word/document.xml"];
  const relBytes = selected["word/_rels/document.xml.rels"];
  if (!document || !relBytes) return draft;
  const xml = strFromU8(document), relXml = strFromU8(relBytes);
  const paths = new Map<string, string>();
  for (const match of relXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const element = match[0];
    const get = (key: string) => new RegExp(`\\b${key}="([^"]*)"`).exec(element)?.[1];
    const id = get("Id"), target = get("Target"), type = get("Type");
    if (!id || !target || !type?.endsWith("/image") || get("TargetMode") === "External") continue;
    const clean = target.replace(/\\/g,"/");
    const name = clean.startsWith("/") ? clean.replace(/^\//,"") : "word/" + clean;
    if (!/^word\/media\/[^/]+\.(?:png|jpe?g)$/i.test(name)) continue;
    paths.set(id,name);
  }
  const sourceImages: {src:string;alt:string}[] = [];
  let total = 0;
  const referenced = new Set<string>();
  for (const match of xml.matchAll(/<a:blip\b[^>]*\br:embed="([^"]+)"[^>]*\/>|<v:imagedata\b[^>]*\br:id="([^"]+)"[^>]*\/>/g)) {
    const id = match[1] ?? match[2];
    const filename = paths.get(id);
    if (!filename || referenced.has(id)) continue;
    referenced.add(id);
    const data = selected[filename];
    if (!data) continue;
    const mediaType = /\.png$/i.test(filename) ? "image/png" : "image/jpeg";
    const binary = Array.from(data, b=>String.fromCharCode(b)).join("");
    const src = `data:${mediaType};base64,${btoa(binary)}`;
    try {
      decodeImage(src);
      total += src.length;
      if (total > MAX_PROJECT_IMAGES_BYTES) throw Error("DOCX images exceed the 12 MB project limit.");
      sourceImages.push({src,alt:`Imported illustration ${sourceImages.length+1}`});
    } catch { /* unsupported image: leave the placeholder for manual replacement */ }
  }
  const existing = draft.blocks.filter(b=>b.type==="image").length;
  if (existing >= sourceImages.length || !sourceImages.length) return draft;
  let nextImage = existing;
  let recovered = 0;
  const blocks: ImportBlock[] = [];
  const marker = /\[Image: [^\]]*\]/g;
  for (const block of draft.blocks) {
    if (block.type !== "paragraph" && block.type !== "heading") {blocks.push(block);continue;}
    let pending: typeof block.content = [];
    const flush = () => {if (pending?.some(p=>p.text.trim())) blocks.push({...block,content:pending});pending=[];};
    for (const inline of block.content ?? []) {
      let last=0;
      for(const found of inline.text.matchAll(marker)){
        if (found.index>last) pending!.push({...inline,text:inline.text.slice(last,found.index)});
        if(nextImage<sourceImages.length){
          flush();
          const source=sourceImages[nextImage++];
          blocks.push({type:"image",attrs:{src:source.src,alt:source.alt,width:100,align:"center",caption:""}});
          recovered++;
        } else pending!.push({...inline,text:found[0]});
        last=found.index+found[0].length;
      }
      if(last<inline.text.length) pending!.push({...inline,text:inline.text.slice(last)});
    }
    if(recovered && !pending?.length) continue;
    if(pending?.length) blocks.push({...block,content:pending});
    else if(!recovered) blocks.push(block);
  }
  if(recovered){
    draft.blocks=blocks;
    draft.diagnostics.push({severity:"info",message:`Recovered ${recovered} image(s) directly from DOCX media after HTML conversion produced placeholders.`});
  }
  return draft;
}
