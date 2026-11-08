import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

export default function QrScanner({ onDecode, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        scanFrame();
      } catch (cameraError) {
        console.error(cameraError);
        setError("Camera access is unavailable. Allow camera permission or enter the QR link manually below.");
      }
    }

    function scanFrame() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        frameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imageData.data, imageData.width, imageData.height);

      if (result?.data) {
        onDecode(result.data);
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
  }, [onDecode]);

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
        <button type="button" onClick={onClose} className="qr-scanner-cancel mt-2 w-full rounded border px-4 py-2 font-semibold">
          Cancel
        </button>
      </div>
    </div>
  );
}
