import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it } from "vitest";
import { docxFixture } from "./fixtures";

async function runWorker(bytes: Uint8Array, filename: string) {
  const results: unknown[] = [];
  const target: {
    postMessage: (message: unknown) => void;
    onmessage?: (event: {
      data: { bytes: Uint8Array; filename: string };
    }) => Promise<void>;
  } = { postMessage: (message) => results.push(message) };
  // A Web Worker has no window or document. Execute the actual production bundle.
  const scope = Object.assign(target, {
    console,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    DataView,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    atob,
    btoa,
    importScripts: () => {
      throw Error("Unexpected external script request");
    },
  });
  vm.runInNewContext(
    readFileSync("public/import-worker.js", "utf8"),
    Object.assign(scope, { self: scope }),
  );
  await target.onmessage!({ data: { bytes, filename } });
  return results[0] as {
    ok: boolean;
    draft?: { blocks: { type: string; content?: { text: string }[] }[] };
    error?: string;
  };
}
it("runs the production Markdown worker without a DOM", async () => {
  const result = await runWorker(
    new TextEncoder().encode("# One\n\nA &amp; B."),
    "test.md",
  );
  expect(result.ok).toBe(true);
  expect(result.draft?.blocks[1].content?.[0].text).toBe("A & B.");
});
it("runs DOCX conversion with the browser adapters inside the DOM-free bundle", async () => {
  const result = await runWorker(docxFixture(), "test.docx");
  expect(result.ok, result.error).toBe(true);
  expect(
    result.draft?.blocks.some((b) =>
      b.content?.some((x) => x.text.includes("bold words")),
    ),
  ).toBe(true);
});
