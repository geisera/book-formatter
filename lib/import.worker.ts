import { importBytes } from "./import";
self.onmessage = async (
  event: MessageEvent<{ bytes: Uint8Array; filename: string }>,
) => {
  try {
    self.postMessage({
      ok: true,
      draft: await importBytes(event.data.bytes, event.data.filename),
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Import failed. The source file was not changed.",
    });
  }
};
