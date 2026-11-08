import { useEffect, useRef, useState } from "react";
import { HubIcon } from "./DashboardHub";

export default function EggNfcSetup({ url, t }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const controller = useRef(null);
  const dialog = useRef(null);
  const supported = typeof window !== "undefined" && "NDEFReader" in window;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);

  function close() {
    controller.current?.abort();
    dialog.current?.close();
    setOpen(false);
    setMessage("");
    setError("");
  }
  async function copy() {
    setError("");
    try {
      await navigator.clipboard.writeText(url);
      setMessage(t("admin.nfc.copied", { defaultValue: "Link copied. Paste it into your NFC writer app as a URL." }));
    } catch (failure) {
      console.error("Unable to copy NFC URL", failure);
      setError(t("admin.nfc.copyError", { defaultValue: "Could not copy. Select and copy the link below." }));
    }
  }
  async function write() {
    setBusy(true);
    setError("");
    setMessage(t("admin.nfc.holdTag", { defaultValue: "Hold an NFC tag near your phone." }));
    controller.current = new AbortController();
    try {
      const reader = new window.NDEFReader();
      await reader.write({ records: [{ recordType: "url", data: url }] }, { signal: controller.current.signal });
      setMessage(t("admin.nfc.written", { defaultValue: "Tag written. Tap it to test your Egg." }));
    } catch (failure) {
      if (failure.name !== "AbortError") {
        console.error("Unable to write NFC tag", failure);
        setMessage("");
        setError(t("admin.nfc.writeError", { defaultValue: "Could not write this tag. Check permission and use a writable NFC tag." }));
      }
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }
  return <>
    <button type="button" className="hub-secondary-action" onClick={() => setOpen(true)}><HubIcon type="nfc" />{t("admin.nfc.configure", { defaultValue: "Configure NFC" })}</button>
    {open && <dialog ref={dialog} className="hub-modal" aria-label={t("admin.nfc.configure", { defaultValue: "Configure NFC" })} onCancel={(event) => { event.preventDefault(); close(); }} onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }}>
        <div className="hub-modal-heading"><h3>{t("admin.nfc.configure", { defaultValue: "Configure NFC" })}</h3><button type="button" onClick={close}>{t("common.close", { defaultValue: "Close" })}</button></div>
        <ol className="hub-nfc-steps">
          <li>{t("admin.nfc.step1", { defaultValue: "Open an NFC writer app on your phone." })}</li>
          <li>{t("admin.nfc.step2", { defaultValue: "Choose URL, paste this link, and write the tag." })}</li>
          <li>{t("admin.nfc.step3", { defaultValue: "Tap the tag to test, then place it at your location." })}</li>
        </ol>
        <input aria-label={t("admin.nfc.link", { defaultValue: "NFC link" })} readOnly value={url} onFocus={(event) => event.target.select()} />
        <button type="button" className="goal-primary-action" onClick={copy}>{t("admin.engagement.campaigns.copyNfcLink")}</button>
        {supported && <div className="hub-nfc-direct">
          <p>{t("admin.nfc.directHint", { defaultValue: "Or write directly with this phone. This replaces the tag's current content." })}</p>
          <button type="button" className="hub-secondary-action" disabled={busy} onClick={write}>{busy ? t("admin.nfc.writing", { defaultValue: "Waiting for tag..." }) : t("admin.nfc.write", { defaultValue: "Write tag" })}</button>
        </div>}
        {message && <p role="status" className="hub-notice">{message}</p>}
        {error && <p role="alert" className="hub-error">{error}</p>}
    </dialog>}
  </>;
}
