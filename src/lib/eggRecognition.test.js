import { describe, expect, it, vi } from "vitest";
import { readEggNfcLink, scanEggNfc } from "./eggRecognition";

const record = (value, recordType = "url") => ({
  recordType, data: new TextEncoder().encode(value), encoding: "utf-8"
});

describe("Egg NFC recognition", () => {
  it.each(["url", "text"])("reads %s records without rewriting the tag", type => {
    expect(readEggNfcLink({ records: [record(" https://hellogodwit.com/qr/egg?via=nfc ", type)] }))
      .toBe("https://hellogodwit.com/qr/egg?via=nfc");
  });
  it("skips non-link record types and empty records", () => {
    expect(readEggNfcLink({ records: [record("ignored", "mime"), record(""), record("egg", "text")] })).toBe("egg");
    expect(() => readEggNfcLink({ records: [record("ignored", "mime")] })).toThrow("does not contain a link");
  });
  it("starts a cancellable read, routes links and ignores events after cancellation", async () => {
    let reader;
    class Reader {
      constructor() { reader = this; }
      scan = vi.fn().mockResolvedValue(undefined);
    }
    const controller = new AbortController();
    const onRead = vi.fn(), onError = vi.fn();
    await scanEggNfc({ onRead, onError, signal: controller.signal, Reader });
    expect(reader.scan).toHaveBeenCalledWith({ signal: controller.signal });
    reader.onreading({ message: { records: [record("https://hellogodwit.com/qr/one?via=nfc")] } });
    expect(onRead).toHaveBeenCalledExactlyOnceWith("https://hellogodwit.com/qr/one?via=nfc");
    controller.abort();
    reader.onreading({ message: { records: [record("another")] } });
    reader.onreadingerror();
    expect(onRead).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(reader.write).toBeUndefined();
  });
  it("reports unreadable and linkless tags", async () => {
    let reader;
    class Reader {
      constructor() { reader = this; }
      scan = vi.fn().mockResolvedValue(undefined);
    }
    const onError = vi.fn();
    await scanEggNfc({ onRead: vi.fn(), onError, signal: new AbortController().signal, Reader });
    reader.onreading({ message: { records: [] } });
    expect(onError.mock.calls[0][0].message).toContain("does not contain a link");
    reader.onreadingerror();
    expect(onError.mock.calls[1][0].message).toContain("could not be read");
  });
  it("propagates NFC permission failures to the UI", async () => {
    class Reader { scan = vi.fn().mockRejectedValue(new Error("Permission denied")); }
    await expect(scanEggNfc({ signal: new AbortController().signal, Reader })).rejects.toThrow("Permission denied");
  });
});
