import { useEffect, useState } from "react";
import { loadEggQrArtwork, EGG_PRINT_FORMATS, eggPrintDimensions } from "../lib/eggQrPrint";

export default function EggQrPreview({ url, format, onFormatChange, t }) {
  const [artwork, setArtwork] = useState("");
  const [error, setError] = useState("");
  const caption = t("admin.engagement.campaigns.scanToView");
  useEffect(() => {
    let cancelled = false;
    setArtwork("");
    setError("");
    loadEggQrArtwork(url, caption)
      .then(value => { if (!cancelled) setArtwork(value); })
      .catch(cause => {
        console.error("Unable to preview Egg QR", cause);
        if (!cancelled) setError(t("admin.engagement.campaigns.qrLoadError"));
      });
    return () => { cancelled = true; };
  }, [url, caption, t]);
  const paper = eggPrintDimensions(format);
  return <div className="egg-print-proposal">
    <div className="egg-print-artwork">
      {artwork && <img src={artwork} alt={t("admin.engagement.campaigns.printPreview")} />}
      {!artwork && !error && <p role="status">{t("admin.engagement.campaigns.preparingQr", { defaultValue: "Preparing the QR code..." })}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
    <div className="egg-print-dimensions">
      <label>{t("admin.engagement.campaigns.paperSize")}
        <select value={format} onChange={event => onFormatChange(event.target.value)}>
          {Object.entries(EGG_PRINT_FORMATS).map(([key, value]) => <option key={key} value={key}>{value.label} · {value.width} × {value.height} mm</option>)}
        </select>
      </label>
      <p>{t("admin.engagement.campaigns.artworkSize")}<strong>{paper.artworkWidth} × {paper.artworkHeight.toFixed(1)} mm</strong></p>
      <p>{t("admin.engagement.campaigns.qrSize")}<strong>{paper.qrWidth.toFixed(1)} × {paper.qrWidth.toFixed(1)} mm</strong></p>
      <p>{t("admin.engagement.campaigns.printScale")}</p>
    </div>
  </div>;
}
