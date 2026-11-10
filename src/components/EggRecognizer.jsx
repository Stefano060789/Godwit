import { useEffect, useRef, useState } from "react";
import { scanEggNfc } from "../lib/eggRecognition";

export default function EggRecognizer({ onRecognize, onOpenCamera, t }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef(null);
  const root = useRef(null);
  const supported = typeof window !== "undefined" && window.isSecureContext && "NDEFReader" in window;
  const key = "admin.engagement.scanner";

  function stopReading() {
    controller.current?.abort();
    controller.current = null;
    setReading(false);
  }

  useEffect(() => {
    const details = root.current?.closest("details");
    const onToggle = () => { if (!details.open) stopReading(); };
    details?.addEventListener("toggle", onToggle);
    return () => {
      controller.current?.abort();
      details?.removeEventListener("toggle", onToggle);
    };
  }, []);

  async function recognize(link) {
    stopReading();
    setBusy(true);
    setError("");
    try {
      await onRecognize(link);
    } catch (failure) {
      console.error("Unable to recognize Egg", failure);
      setError(t(`${key}.lookupError`, { defaultValue: "Could not recognize this Egg. Please try again." }));
    } finally {
      setBusy(false);
    }
  }

  async function readNfc() {
    stopReading();
    const scan = new AbortController();
    controller.current = scan;
    setReading(true);
    setError("");
    try {
      await scanEggNfc({
        signal: scan.signal,
        onRead: link => { setValue(link); void recognize(link); },
        onError: failure => {
          console.error("Unable to read Egg NFC", failure);
          stopReading();
          setError(t(`${key}.nfcError`, { defaultValue: "Could not read the NFC link. Check NFC and browser permissions, try again, or paste the Egg link." }));
        }
      });
    } catch (failure) {
      if (!scan.signal.aborted) {
        console.error("Unable to start Egg NFC recognition", failure);
        stopReading();
        setError(t(`${key}.nfcError`, { defaultValue: "Could not read the NFC link. Check NFC and browser permissions, try again, or paste the Egg link." }));
      }
    }
  }

  return <div ref={root} className="egg-recognizer">
    <form className="egg-recognizer-form" onSubmit={event => { event.preventDefault(); void recognize(value); }}>
      <label htmlFor="egg-recognition-link">{t(`${key}.linkLabel`, { defaultValue: "Egg link" })}</label>
      <div className="egg-recognizer-link">
        <input id="egg-recognition-link" value={value} onChange={event => setValue(event.target.value)}
          placeholder={t(`${key}.pastePlaceholder`)} autoComplete="off" spellCheck={false} required />
        <button type="submit" disabled={busy || reading || !value.trim()} className="egg-scanner-lookup px-4 py-2 rounded font-semibold">
          {busy ? t(`${key}.recognizing`, { defaultValue: "Recognizing..." }) : t(`${key}.lookUp`)}
        </button>
      </div>
    </form>
    <div className="egg-recognizer-actions">
      <button type="button" disabled={busy} onClick={() => { stopReading(); setError(""); onOpenCamera(); }} className="hub-secondary-action">{t(`${key}.openCamera`)}</button>
      <button type="button" disabled={!supported || busy || reading} onClick={readNfc} className="hub-secondary-action">{t(`${key}.readNfc`, { defaultValue: "Recognize with NFC" })}</button>
      {reading && <button type="button" onClick={stopReading} className="hub-secondary-action">{t("common.cancel", { defaultValue: "Cancel" })}</button>}
    </div>
    {reading && <p role="status">{t(`${key}.holdNfc`, { defaultValue: "Hold the NFC tag near your phone to recognize the Egg." })}</p>}
    {!supported && <p className="text-sm">{t(`${key}.nfcUnsupported`, { defaultValue: "Direct NFC reading needs a compatible phone and browser over HTTPS (such as Chrome on Android). Otherwise, tap the tag with your phone, copy the opened Egg link, and paste it above." })}</p>}
    {error && <p role="alert" className="hub-error">{error}</p>}
  </div>;
}
