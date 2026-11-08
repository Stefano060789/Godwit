import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

export default function QrScanner({ onDecode, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const onDecodeRef = useRef(onDecode);
  const [error, setError] = useState("");

  onDecodeRef.current = onDecode;

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const getUserMedia = navigator.mediaDevices?.getUserMedia;
        if (!getUserMedia) {
          throw new Error("Camera access requires a supported browser and a secure HTTPS connection. Use a photo or paste the QR link instead.");
        }
        const stream = await getUserMedia.call(navigator.mediaDevices, { video: { facingMode: { ideal: "environment" } } });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setError("");
        scanFrame();
      } catch (cameraError) {
        console.error(cameraError);
        const message = cameraError instanceof Error ? cameraError.message : "";
        const errorName = cameraError?.name;
        setError(message || (errorName === "NotAllowedError" || errorName === "PermissionDeniedError"
          ? "Camera permission was denied. Allow camera access in your browser settings, use a photo, or paste the QR link."
          : errorName === "NotFoundError" || errorName === "DevicesNotFoundError"
            ? "No camera was found. Use a photo or paste the QR link instead."
            : "Camera access is unavailable. Use a photo or paste the QR link instead."));
      }
    }

    function scanFrame() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (cancelled) return;
      if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        frameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context || !canvas.width || !canvas.height) {
          frameRef.current = requestAnimationFrame(scanFrame);
          return;
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(imageData.data, imageData.width, imageData.height);

        if (result?.data) {
          onDecodeRef.current(result.data);
          return;
        }
      } catch (scanError) {
        console.error("Unable to scan the camera frame", scanError);
        setError("The camera is active but this frame could not be scanned. Use a photo or paste the QR link instead.");
        return;
      }

      frameRef.current = requestAnimationFrame(scanFrame);
    }

    startCamera();

    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function handlePhotoSelection(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d", { willReadFrequently: true });
        if (!canvas || !context) throw new Error("Image scanning is not supported in this browser.");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        context.drawImage(bitmap, 0, 0);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(imageData.data, imageData.width, imageData.height);
        if (!result?.data) {
          setError("No QR code was found in that image. Try another photo or paste the QR link.");
          return;
        }
        setError("");
        onDecodeRef.current(result.data);
      } finally {
        bitmap.close();
      }
    } catch (photoError) {
      console.error("Unable to scan selected QR image", photoError);
      setError(photoError instanceof Error ? photoError.message : "Unable to scan that image. Try another photo or paste the QR link.");
    }
  }

  return (
    <div className="godwit-dialog-overlay fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Scan a QR code">
      <div className="godwit-dialog-panel qr-scanner-modal w-full max-w-sm rounded-lg p-4 text-center">
        <p className="mb-3 font-semibold">Point your camera at a QR code</p>
        {error ? (
          <p className="qr-scanner-error mb-3 text-sm">{error}</p>
        ) : (
          <video ref={videoRef} className="mx-auto mb-3 w-full rounded" muted playsInline />
        )}
        <canvas ref={canvasRef} className="hidden" />
        <label className="qr-scanner-photo mt-2 block w-full cursor-pointer rounded border px-4 py-2 font-semibold">
          Use camera or choose a QR photo
          <input type="file" accept="image/*" capture="environment" onChange={handlePhotoSelection} className="sr-only" />
        </label>
        <button type="button" onClick={onClose} className="qr-scanner-cancel mt-2 w-full rounded border px-4 py-2 font-semibold">
          Cancel
        </button>
      </div>
    </div>
  );
}
