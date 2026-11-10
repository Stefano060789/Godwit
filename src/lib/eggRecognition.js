export function readEggNfcLink(message) {
  for (const record of message.records) {
    if (record.recordType === "url" || record.recordType === "text") {
      const value = new TextDecoder(record.encoding || "utf-8").decode(record.data).trim();
      if (value) return value;
    }
  }
  throw new Error("The NFC tag does not contain a link.");
}

export async function scanEggNfc({ onRead, onError, signal, Reader = window.NDEFReader }) {
  const reader = new Reader();
  reader.onreading = event => {
    if (signal.aborted) return;
    try {
      onRead(readEggNfcLink(event.message));
    } catch (error) {
      onError(error);
    }
  };
  reader.onreadingerror = () => {
    if (!signal.aborted) onError(new Error("The NFC tag could not be read."));
  };
  await reader.scan({ signal });
}
