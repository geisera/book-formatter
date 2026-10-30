/** Local, self-contained raster images. No remote URLs, SVG or scripts. */
export type ImageAlign = "left" | "center" | "right";
export type ImageWidth = 25 | 50 | 75 | 100;
export const MAX_IMAGE_BYTES = 1_500_000;
export const MAX_PROJECT_IMAGES_BYTES = 12_000_000;
export type ImageAttrs = { src: string; alt: string; width: ImageWidth; align: ImageAlign };
export function decodeImage(src: string): {bytes: Uint8Array; mediaType: "image/png" | "image/jpeg"; extension: "png" | "jpg"} {
  if (typeof src !== "string" || src.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 128)
    throw Error("Image exceeds the 1.5 MB per-image limit.");
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
  if (!match) throw Error("Only embedded PNG and JPEG images are supported.");
  let bytes: Uint8Array;
  try {
    const binary = atob(match[2]);
    bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  } catch { throw Error("Image data is damaged."); }
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw Error("Image exceeds the 1.5 MB per-image limit.");
  const png = match[1] === "image/png";
  const valid = png
    ? bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)
    : bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!valid) throw Error("Image format does not match its file contents.");
  return { bytes, mediaType: png ? "image/png" : "image/jpeg", extension: png ? "png" : "jpg" };
}
export function validateImageAttrs(attrs: Record<string, unknown>): void {
  decodeImage(attrs.src as string);
  if (typeof attrs.alt !== "string" || !attrs.alt.trim() || attrs.alt.length > 500)
    throw Error("Image alt text is required (up to 500 characters).");
  if (![25,50,75,100].includes(attrs.width as number) || !["left","center","right"].includes(attrs.align as string))
    throw Error("Invalid image size or alignment.");
}
export function embeddedImages(content: Record<string,unknown>): ImageAttrs[] {
  const result: ImageAttrs[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    const node = v as Record<string,unknown>;
    if (node.type === "image") result.push(node.attrs as ImageAttrs);
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(content);
  return result;
}
