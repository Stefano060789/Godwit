export const EGG_ACCESS_METHODS = Object.freeze({
  QR: "qr",
  NFC: "nfc"
});

export function buildEggUrl(origin, token, accessMethod = EGG_ACCESS_METHODS.QR) {
  const url = new URL(`/qr/${encodeURIComponent(token)}`, origin);
  if (accessMethod === EGG_ACCESS_METHODS.NFC) {
    url.searchParams.set("via", EGG_ACCESS_METHODS.NFC);
  } else {
    url.searchParams.set("via", EGG_ACCESS_METHODS.QR);
  }
  return url.toString();
}

export function normalizeEggAccessMethod(value) {
  return value === EGG_ACCESS_METHODS.NFC
    ? EGG_ACCESS_METHODS.NFC
    : EGG_ACCESS_METHODS.QR;
}
