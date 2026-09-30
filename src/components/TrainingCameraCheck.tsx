import { useEffect, useRef, useState } from "react";
import { api, apiRequest } from "@/lib/api";

type CameraResult = {
  hairnet_detected: boolean;
  glove_detected: boolean;
  detections: { label: string; confidence: number }[];
  status: "needs_new_frame" | "pending_admin_review";
};

export function TrainingCameraCheck({ moduleId, onSubmitted }: { moduleId: string; onSubmitted: () => Promise<void> }) {
  const usesModel = moduleId === "food-safety";
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const previewUrl = useRef<string | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [captured, setCaptured] = useState<Blob | null>(null);
  const [result, setResult] = useState<CameraResult | null>(null);
  const [error, setError] = useState("");

  const stop = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setActive(false);
  };

  useEffect(() => () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  const start = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is unavailable in this browser. Open the app on localhost or HTTPS.");
      return;
    }
    try {
      const camera = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.current = camera;
      if (video.current) video.current.srcObject = camera;
      setActive(true);
    } catch {
      setError("Camera access was denied or no camera was found. Allow camera access and try again.");
    }
  };

  const capture = async () => {
    const frame = video.current;
    if (!frame || !frame.videoWidth || !frame.videoHeight) {
      setError("Wait for the camera image, then try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1280 / frame.videoWidth);
    canvas.width = Math.round(frame.videoWidth * scale);
    canvas.height = Math.round(frame.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Could not capture the camera frame.");
      return;
    }
    context.drawImage(frame, 0, 0, canvas.width, canvas.height);
    setBusy(true);
    setError("");
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not capture the frame")), "image/jpeg", 0.9),
      );
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(blob);
      setCaptured(blob);
      setResult(null);
      stop();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Camera check failed");
    } finally {
      setBusy(false);
    }
  };

  const retake = async () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setCaptured(null);
    setResult(null);
    await start();
  };

  const sendCaptured = async () => {
    if (!captured) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", captured, `${moduleId}-camera.jpg`);
      if (usesModel) {
        setChecking(true);
        const controller = new AbortController();
        let timedOut = false;
        const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 90_000);
        try {
          const check = await apiRequest<CameraResult>("/seller/training/food-safety/camera-check", {
            method: "POST", body: form, signal: controller.signal,
          });
          setResult(check);
          if (check.status === "pending_admin_review") await onSubmitted();
        } catch (err) {
          if (timedOut) {
            await onSubmitted();
            setError("The camera check took too long. If the lesson is not awaiting admin review, try sending again.");
          } else throw err;
        } finally {
          window.clearTimeout(timeout);
        }
      } else {
        await api.post(`/seller/training/${moduleId}/proofs`, form);
        await onSubmitted();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the photo");
    } finally {
      setChecking(false);
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-muted-foreground">{usesModel
        ? "Show your hairnet and gloves clearly in one frame. The model checks the image, then an admin reviews the proof before approval."
        : "Show the requested proof clearly in the camera. Capture a photo, review it, then send it for admin review."}</p>
      <video ref={video} autoPlay playsInline muted className={"w-full max-w-md rounded-xl bg-black " + (active ? "block" : "hidden")} />
      {captured && previewUrl.current && <img src={previewUrl.current} alt="Captured proof preview" className="w-full max-w-md rounded-xl border border-border object-cover" />}
      <div className="flex flex-wrap gap-2">
        {!active && !captured ? (
          <button type="button" onClick={start} className="rounded-xl bg-gradient-spice px-4 py-2 text-sm font-semibold text-white">Open camera</button>
        ) : active ? (
          <>
            <button type="button" onClick={capture} disabled={busy} className="rounded-xl bg-gradient-spice px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Capturing…" : "Capture photo"}</button>
            <button type="button" onClick={stop} disabled={busy} className="rounded-xl border border-border px-4 py-2 text-sm">Close camera</button>
          </>
        ) : (
          <>
            <button type="button" onClick={retake} disabled={busy} className="rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50">Retake photo</button>
            <button type="button" onClick={sendCaptured} disabled={busy} className="rounded-xl bg-gradient-spice px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? checking ? "Checking photo…" : "Sending…" : "Send photo for admin review"}</button>
          </>
        )}
      </div>
      {checking && <p className="text-sm text-muted-foreground" role="status">Checking for a hairnet and gloves. The first check may take a minute.</p>}
      {result && usesModel && <p className="text-sm" aria-live="polite">Hairnet: {result.hairnet_detected ? "detected" : "not detected"} · Gloves: {result.glove_detected ? "detected" : "not detected"}. {result.status === "pending_admin_review" ? "Proof submitted for admin review." : "Adjust the camera view and capture again."}</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}
