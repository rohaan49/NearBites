import { useEffect, useRef, useState } from "react";

type Props = { photo: File | null; onChange: (photo: File | null) => void };

export function DishPhotoPicker({ photo, onChange }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

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
      <p className="mb-2 text-sm font-semibold">Dish photo</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={openCamera} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">Open camera</button>
        <label htmlFor="dish-phone-camera" className="cursor-pointer rounded-xl border border-border px-4 py-2 text-sm font-semibold">Take photo on phone</label>
        <input id="dish-phone-camera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={chooseFile} />
        <label htmlFor="dish-upload" className="cursor-pointer rounded-xl border border-border px-4 py-2 text-sm font-semibold">Choose existing photo</label>
        <input id="dish-upload" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={chooseFile} />
      </div>
      {cameraOpen && <div className="mt-3 space-y-2">
        <video ref={video} autoPlay playsInline muted className="w-full max-w-md rounded-xl bg-black" />
        <div className="flex gap-2">
          <button type="button" onClick={capture} disabled={capturing} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{capturing ? "Capturing…" : "Capture photo"}</button>
          <button type="button" onClick={closeCamera} className="rounded-xl border border-border px-4 py-2 text-sm">Close camera</button>
        </div>
      </div>}
      {previewUrl && <img src={previewUrl} alt="Selected dish photo" className="mt-3 h-36 w-48 rounded-xl border border-border object-cover" />}
      {photo && <p className="mt-2 text-xs text-muted-foreground" role="status">Ready to submit: {photo.name}</p>}
      {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}
