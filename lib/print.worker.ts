import { buildPrintPdf, type PrintFonts } from "./print";
import type { Book } from "./model";
self.onmessage = async (
  event: MessageEvent<{
    book: Book;
    fonts: PrintFonts;
    id: string;
    createdAt: string;
    includeFrontCover?: boolean;
  }>,
) => {
  try {
    const { book, fonts, id, createdAt, includeFrontCover } = event.data;
    const result = await buildPrintPdf(book, fonts, { id, createdAt, includeFrontCover, onProgress:(percent,stage)=>self.postMessage({type:"progress",percent,stage}) });
    self.postMessage(
      { ok: true, ...result },
      { transfer: [result.bytes.buffer as ArrayBuffer] },
    );
  } catch (e) {
    self.postMessage({
      ok: false,
      error: e instanceof Error ? e.message : "Print proof failed.",
    });
  }
};
