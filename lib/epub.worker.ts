import { buildEpub, type FontAssets } from "./epub";
import type { Book } from "./model";
self.onmessage = (
  event: MessageEvent<{
    book: Book;
    fonts?: FontAssets;
    id: string;
    createdAt: string;
  }>,
) => {
  try {
    const { book, fonts, id, createdAt } = event.data;
    const result = buildEpub(book, fonts, { id, createdAt });
    self.postMessage(
      { ok: true, ...result },
      { transfer: [result.bytes.buffer as ArrayBuffer] },
    );
  } catch (e) {
    self.postMessage({
      ok: false,
      error: e instanceof Error ? e.message : "EPUB generation failed.",
    });
  }
};
