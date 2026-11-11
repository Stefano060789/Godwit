import QRCode from "qrcode";
import godwitMark from "../assets/godwit-mark.svg";

export const EGG_PRINT_FORMATS = {
  a4: { label: "A4", width: 210, height: 297 },
  a5: { label: "A5", width: 148, height: 210 },
  a6: { label: "A6", width: 105, height: 148 },
  a3: { label: "A3", width: 297, height: 420 },
  letter: { label: "Letter", width: 215.9, height: 279.4 },
  postcard: { label: "Postcard", width: 127, height: 177.8 },
  beerHolder: { label: "Coaster", width: 101.6, height: 101.6 },
  ticket: { label: "Ticket", width: 88.9, height: 203.2 }
};

const escape = (value) => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export function eggPrintDimensions(format) {
  const paper = EGG_PRINT_FORMATS[format] || EGG_PRINT_FORMATS.a4;
  const width = Math.floor(Math.min(paper.width - 16, (paper.height - 16) * 400 / 480));
  return { ...paper, artworkWidth: width, artworkHeight: width * 1.2, qrWidth: width * .75 };
}

export async function createEggQrArtwork(url, { caption, logoDataUrl }) {
  const qr = await QRCode.toString(url, { type: "svg", margin: 4, errorCorrectionLevel: "M", color: { dark: "#102e2b", light: "#ffffff" } });
  const qrData = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1440" viewBox="0 0 400 480">
    <path d="M200 8C90 8 8 110 8 260C8 400 80 472 200 472C320 472 392 400 392 260C392 110 310 8 200 8Z" fill="#fffdf7" stroke="#ba985f" stroke-width="2"/>
    <image href="${escape(logoDataUrl)}" x="181" y="25" width="38" height="38"/>
    <image href="${escape(qrData)}" x="50" y="115" width="300" height="300"/>
    <text x="200" y="439" text-anchor="middle" fill="#284542" font-family="Arial,sans-serif" font-size="18" font-weight="700">${escape(caption)}</text>
    <text x="200" y="464" text-anchor="middle" fill="#725326" font-family="Arial,sans-serif" font-size="16" font-weight="700">hellogodwit.com</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function loadEggQrArtwork(url, caption) {
  return createEggQrArtwork(url, { caption, logoDataUrl: await loadLogo() });
}

async function loadLogo() {
  const result = await fetch(godwitMark);
  if (!result.ok) throw new Error("Unable to load Godwit bird mark.");
  const blob = await result.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read Godwit logo."));
    reader.readAsDataURL(blob);
  });
}

export async function downloadEggQr(url, name, caption) {
  const artwork = await loadEggQrArtwork(url, caption);
  const image = new Image();
  image.src = artwork;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1440;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("QR image export is unavailable.");
  context.drawImage(image, 0, 0);
  const link = document.createElement("a");
  link.download = `${String(name || "egg").replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}-qr.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export function eggPrintDocument({ t, returnUrl, format }) {
  const text = (key, fallback) => escape(t(`admin.engagement.campaigns.${key}`, { defaultValue: fallback }));
  const options = Object.entries(EGG_PRINT_FORMATS).map(([key, paper]) =>
    `<option value="${key}"${key === format ? " selected" : ""}>${paper.label} · ${paper.width} × ${paper.height} mm</option>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${text("printTitle", "Print your Egg QR")}</title>
    <style id="paper-style"></style>
    <style>
      *{box-sizing:border-box}body{margin:0;padding:24px;background:#edf2f0;color:#284542;font:14px Arial,sans-serif}
      .print-layout{max-width:1000px;margin:auto;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px;align-items:start}
      .print-preview{min-width:0;background:#fff;border:1px solid #d5dfda;border-radius:20px;padding:20px}
      .poster{display:block;width:100%;max-width:430px;height:auto;margin:auto}
      .print-controls{position:sticky;top:24px;background:#fff;border:1px solid #d5dfda;border-radius:16px;padding:20px}
      h1{font-size:20px;margin:0 0 12px}p{line-height:1.5}label{display:grid;gap:8px;font-weight:700}
      select,button,a{font:inherit;min-height:44px;border-radius:9px}select{width:100%;padding:8px;border:1px solid #9db5ad;background:white;color:#284542}
      .dimensions{background:#edf4f1;padding:12px;border-radius:9px;line-height:1.7;margin:16px 0}
      button,a{display:flex;align-items:center;justify-content:center;width:100%;padding:10px;text-decoration:none}
      button{border:0;background:#176f68;color:#fff;font-weight:700;cursor:pointer}button:disabled{opacity:.5;cursor:wait}a{margin-top:8px;color:#284542;border:1px solid #cbd7d1}
      #print-status{font-size:13px}#print-status[role=alert]{color:#a33b32}
      @media(max-width:640px){body{padding:12px}.print-layout{grid-template-columns:minmax(0,1fr);gap:12px}.print-controls{position:static;grid-row:1;padding:16px}.print-preview{padding:12px}.dimensions{margin:10px 0}}
      @media print{body{padding:0;background:white}.print-layout{display:block;max-width:none}.print-controls{display:none!important}.print-preview{padding:0;border:0;border-radius:0;background:none}.poster{max-width:none;margin:auto;break-inside:avoid}}
    </style></head><body><main class="print-layout">
      <section class="print-preview" aria-label="${text("printPreview", "Print preview")}"><img id="qr-artwork" class="poster" alt="${text("printPreview", "Print preview")}" /></section>
      <section class="print-controls"><h1>${text("printTitle", "Print your Egg QR")}</h1>
        <label>${text("paperSize", "Paper size")}<select id="paper-size">${options}</select></label>
        <div class="dimensions"><div>${text("artworkSize", "Printed Egg")}: <strong id="artwork-size"></strong></div><div>${text("qrSize", "QR area (including quiet zone)")}: <strong id="qr-size"></strong></div></div>
        <p>${text("printScale", "Print at 100% / actual size. Turn off browser headers and footers. Dimensions include the QR's white quiet zone.")}</p>
        <button id="print-button" type="button" disabled>${text("printAction", "Choose printer")}</button>
        <a href="${escape(returnUrl)}">${text("returnToDashboard", "Back to Godwit")}</a>
        <p id="print-status" role="status">${text("preparingQr", "Preparing the QR code...")}</p>
      </section></main></body></html>`;
}

export function openEggQrPrint({ url, format, t, returnUrl }) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error(t("admin.engagement.campaigns.popupBlocked", { defaultValue: "Allow pop-ups to open the print preview." }));
  popup.document.write(eggPrintDocument({ t, returnUrl, format }));
  popup.document.close();
  const doc = popup.document;
  const select = doc.getElementById("paper-size");
  const updateSize = () => {
    const paper = eggPrintDimensions(select.value);
    doc.getElementById("paper-style").textContent = `@page{size:${paper.width}mm ${paper.height}mm;margin:8mm}@media print{#qr-artwork{width:${paper.artworkWidth}mm;height:${paper.artworkHeight}mm}}`;
    doc.getElementById("artwork-size").textContent = `${paper.artworkWidth} × ${paper.artworkHeight.toFixed(1)} mm`;
    doc.getElementById("qr-size").textContent = `${paper.qrWidth.toFixed(1)} × ${paper.qrWidth.toFixed(1)} mm`;
  };
  updateSize();
  select.addEventListener("change", updateSize);
  doc.getElementById("print-button").addEventListener("click", () => { popup.focus(); popup.print(); });
  const image = doc.getElementById("qr-artwork");
  const status = doc.getElementById("print-status");
  return loadEggQrArtwork(url, t("admin.engagement.campaigns.scanToView")).then(async artwork => {
    image.src = artwork;
    await image.decode();
    doc.getElementById("print-button").disabled = false;
    status.textContent = t("admin.engagement.campaigns.qrReady", { defaultValue: "QR code ready. Choose a printer to print." });
  }).catch(error => {
    status.setAttribute("role", "alert");
    status.textContent = t("admin.engagement.campaigns.qrLoadError", { defaultValue: "The QR artwork could not be loaded. Close this page and try again." });
    throw error;
  });
}
