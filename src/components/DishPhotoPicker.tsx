import { useLanguage } from "@/lib/language";
import { api } from "@/lib/api";
import { useEffect, useRef, useState } from "react";

type Props = { photo: File | null; onChange: (photo: File | null) => void; cameraOnly?: boolean; onCaptureToken?: (token: string | null) => void };

export function DishPhotoPicker({ photo, onChange, cameraOnly = false, onCaptureToken }: Props) {
  const { t } = useLanguage();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState<{ code: string; token: string } | null>(null);

  useEffect(() => {
    if (cameraOpen && video.current && stream.current) video.current.srcObject = stream.current;
  }, [cameraOpen]);

  useEffect(() => {
    if (!photo) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => () => stream.current?.getTracks().forEach((track) => track.stop()), []);

  const closeCamera = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCameraOpen(false);
  };

  const openCamera = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is unavailable here. Try Take photo on phone or Choose existing photo.");
      return;
    }
    try {
      if (cameraOnly) {
        const issued = await api.post<{ code: string; token: string }>("/uploads/camera-challenge", {});
        setChallenge(issued);
        onCaptureToken?.(null);
      }
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      setCameraOpen(true);
    } catch {
      setError("Camera access failed. Allow access in your browser and try again.");
    }
  };

  const capture = async () => {
    const frame = video.current;
    if (!frame?.videoWidth || !frame.videoHeight) {
      setError("Wait for the camera image, then capture again.");
      return;
    }
    setCapturing(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1280 / frame.videoWidth);
      canvas.width = Math.round(frame.videoWidth * scale);
      canvas.height = Math.round(frame.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not capture the camera image.");
      context.drawImage(frame, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Could not save the camera image.")), "image/jpeg", 0.9,
      ));
      onChange(new File([blob], `dish-${Date.now()}.jpg`, { type: "image/jpeg" }));
      if (cameraOnly) onCaptureToken?.(challenge?.token || null);
      closeCamera();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not capture the photo.");
    } finally {
      setCapturing(false);
    }
  };

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.currentTarget.files?.[0] || null);
    event.currentTarget.value = "";
    setError("");
  };

  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{t("Dish photo")}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={openCamera} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">{t("Open camera")}</button>
        {!cameraOnly && <>
        <label htmlFor="dish-phone-camera" className="cursor-pointer rounded-xl border border-border px-4 py-2 text-sm font-semibold">{t("Take photo on phone")}</label>
        <input id="dish-phone-camera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={chooseFile} />
        <label htmlFor="dish-upload" className="cursor-pointer rounded-xl border border-border px-4 py-2 text-sm font-semibold">{t("Choose existing photo")}</label>
        <input id="dish-upload" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={chooseFile} />
        </>}
      </div>
      {cameraOnly && <p className="mt-2 text-xs text-muted-foreground">{t("Capture today's cooked food in this camera. Write the short code on paper and place it beside the food so an admin can check it. Camera submission is evidence, not a guarantee of authenticity.")}</p>}
      {cameraOpen && challenge && <p className="mt-2 rounded-xl bg-secondary p-3 text-sm font-semibold">{t("Write this code on paper and show it beside the food:")} {challenge.code}</p>}
      {cameraOpen && <div className="mt-3 space-y-2">
        <video ref={video} autoPlay playsInline muted className="w-full max-w-md rounded-xl bg-black" />
        <div className="flex gap-2">
          <button type="button" onClick={capture} disabled={capturing} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{capturing ? t("Capturing…") : t("Capture photo")}</button>
          <button type="button" onClick={closeCamera} className="rounded-xl border border-border px-4 py-2 text-sm">{t("Close camera")}</button>
        </div>
      </div>}
      {previewUrl && <img src={previewUrl} alt={t("Selected dish photo")} className="mt-3 h-36 w-48 rounded-xl border border-border object-cover" />}
      {photo && <p className="mt-2 text-xs text-muted-foreground" role="status">{t("Ready to submit:")} {photo.name}</p>}
      {error && <p className="mt-2 text-sm text-destructive" role="alert">{t(error)}</p>}
    </div>
  );
}
