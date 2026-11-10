import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyStripeSignature(payload, signatureHeader, secret) {
  const timestamp = signatureHeader?.match(/(?:^|,)t=(\d+)/)?.[1];
  const signatures = [...(signatureHeader?.matchAll(/(?:^|,)v1=([^,]+)/g) ?? [])].map(match => match[1]);
  if (!timestamp || !signatures.length || !secret
    || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest();
  return signatures.some(signature => {
    if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
    return timingSafeEqual(Buffer.from(signature, "hex"), expected);
  });
}

export async function readRawBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
