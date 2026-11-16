import { useLanguage } from "@/lib/language";
import { useEffect, useRef, useState } from "react";
import { api, apiRequest } from "@/lib/api";

type CameraResult = {
  hairnet_detected: boolean;
  glove_detected: boolean;
  detections: { label: string; confidence: number }[];
  status: "needs_new_frame" | "pending_admin_review";
};
type CameraChallenge = { instruction: string; token: string };

export function TrainingCameraCheck({ moduleId, onSubmitted }: { moduleId: string; onSubmitted: () => Promise<void> }) {
  const { t } = useLanguage();
  const usesModel = moduleId === "food-safety";
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const previewUrl = useRef<string | null>(null);
  const secondPreviewUrl = useRef<string | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [captured, setCaptured] = useState<Blob | null>(null);
  const [secondCaptured, setSecondCaptured] = useState<Blob | null>(null);
  const [challenge, setChallenge] = useState<CameraChallenge | null>(null);
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
    if (secondPreviewUrl.current) URL.revokeObjectURL(secondPreviewUrl.current);
  }, []);

  const start = async (freshChallenge = false) => {
    setError("");
    if (usesModel && (freshChallenge || !captured)) {
      try { setChallenge(await api.post<CameraChallenge>("/seller/training/food-safety/challenge", {})); }
      catch (err) { setError(err instanceof Error ? err.message : "Could not start camera challenge"); return; }
    }
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
      if (usesModel && captured) {
        if (secondPreviewUrl.current) URL.revokeObjectURL(secondPreviewUrl.current);
        secondPreviewUrl.current = URL.createObjectURL(blob);
        setSecondCaptured(blob);
      } else {
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = URL.createObjectURL(blob);
        setCaptured(blob);
      }
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
    if (secondPreviewUrl.current) URL.revokeObjectURL(secondPreviewUrl.current);
    secondPreviewUrl.current = null;
    setCaptured(null);
    setSecondCaptured(null);
    setChallenge(null);
    setResult(null);
    await start(true);
  };

  const sendCaptured = async () => {
    if (!captured) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", captured, `${moduleId}-camera.jpg`);
      if (usesModel) {
        if (!secondCaptured || !challenge) throw new Error("Capture both camera frames first.");
        form.append("second_file", secondCaptured, `${moduleId}-challenge.jpg`);
        form.append("challenge_token", challenge.token);
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
        ? t("Capture two clear camera frames. Show your hairnet and gloves, then perform the movement below. An admin reviews both frames before approval.")
        : t("Show the requested proof clearly in the camera. Capture a photo, review it, then send it for admin review.")}</p>
      {usesModel && challenge && <p className="rounded-xl bg-secondary p-3 text-sm"><strong>{t("Second frame:")}</strong> {t(challenge.instruction)}</p>}
      <video ref={video} autoPlay playsInline muted className={"w-full max-w-md rounded-xl bg-black " + (active ? "block" : "hidden")} />
      {captured && previewUrl.current && <img src={previewUrl.current} alt={t("Captured proof preview")} className="w-full max-w-md rounded-xl border border-border object-cover" />}
      {secondCaptured && secondPreviewUrl.current && <img src={secondPreviewUrl.current} alt="Challenge frame preview" className="w-full max-w-md rounded-xl border border-border object-cover" />}
      <div className="flex flex-wrap gap-2">
        {!active && !captured ? (
          <button type="button" onClick={() => void start()} className="rounded-xl bg-gradient-spice px-4 py-2 text-sm font-semibold text-white">{t("Open camera")}</button>
        ) : active ? (
          <>
            <button type="button" onClick={capture} disabled={busy} className="rounded-xl bg-gradient-spice px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? t("Capturing…") : usesModel && captured ? t("Capture challenge frame") : t("Capture photo")}</button>
            <button type="button" onClick={stop} disabled={busy} className="rounded-xl border border-border px-4 py-2 text-sm">{t("Close camera")}</button>
          </>
        ) : (
          <>
            <button type="button" onClick={retake} disabled={busy} className="rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50">{t("Retake photo")}</button>
            {usesModel && !secondCaptured ? <button type="button" onClick={() => void start()} disabled={busy} className="rounded-xl bg-gradient-spice px-4 py-2 text-sm font-semibold text-white">{t("Open camera for second frame")}</button> : <button type="button" onClick={sendCaptured} disabled={busy} className="rounded-xl bg-gradient-spice px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? checking ? t("Checking photo…") : t("Sending…") : t("Send photo for admin review")}</button>}
          </>
        )}
      </div>
      {checking && <p className="text-sm text-muted-foreground" role="status">{t("Checking for a hairnet and gloves. The first check may take a minute.")}</p>}
      {result && usesModel && <p className="text-sm" aria-live="polite">{t("Hairnet:")} {result.hairnet_detected ? t("detected") : t("not detected")} {t("· Gloves:")} {result.glove_detected ? t("detected") : t("not detected")}. {result.status === "pending_admin_review" ? t("Proof submitted for admin review.") : t("Adjust the camera view and capture again.")}</p>}
      {error && <p className="text-sm text-destructive" role="alert">{t(error)}</p>}
    </div>
  );
}
