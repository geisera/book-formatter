import { buildPrintPdf, type PrintFonts } from "./print";
import type { Book } from "./model";
self.onmessage = async (
  event: MessageEvent<{
    book: Book;
    fonts: PrintFonts;
    id: string;
    createdAt: string;
  }>,
) => {
  try {
    const { book, fonts, id, createdAt } = event.data;
    const result = await buildPrintPdf(book, fonts, { id, createdAt });
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
