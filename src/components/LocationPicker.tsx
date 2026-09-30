import { useEffect, useRef, useState } from "react";

export type Coordinates = { latitude: number; longitude: number };

const ISLAMABAD = { latitude: 33.7295, longitude: 73.0755 };
const TILE_SIZE = 256;
const MAX_LATITUDE = 85.05112878;

function worldPoint(point: Coordinates, zoom: number) {
  const latitude = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, point.latitude));
  const sine = Math.sin(latitude * Math.PI / 180);
  const size = TILE_SIZE * 2 ** zoom;
  return {
    x: (point.longitude + 180) / 360 * size,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size,
  };
}

function coordinatesAt(x: number, y: number, zoom: number): Coordinates {
  const size = TILE_SIZE * 2 ** zoom;
  return {
    latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * Math.max(0, Math.min(size, y)) / size))) * 180 / Math.PI,
    longitude: (((x / size * 360) % 360) + 540) % 360 - 180,
  };
}

type Props = {
  initial?: Coordinates | null;
  saving?: boolean;
  onSave: (coordinates: Coordinates) => void | Promise<void>;
  onCancel: () => void;
};

export function LocationPicker({ initial, saving = false, onSave, onCancel }: Props) {
  const map = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; center: Coordinates; moved: boolean } | null>(null);
  const [center, setCenter] = useState<Coordinates>(initial ?? ISLAMABAD);
  const [selected, setSelected] = useState<Coordinates | null>(initial ?? null);
  const [zoom, setZoom] = useState(13);
  const [size, setSize] = useState({ width: 480, height: 320 });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!map.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(map.current);
    return () => observer.disconnect();
  }, []);

  const centerPixel = worldPoint(center, zoom);
  const tiles = [];
  const firstX = Math.floor((centerPixel.x - size.width / 2) / TILE_SIZE);
  const lastX = Math.floor((centerPixel.x + size.width / 2) / TILE_SIZE);
  const firstY = Math.floor((centerPixel.y - size.height / 2) / TILE_SIZE);
  const lastY = Math.floor((centerPixel.y + size.height / 2) / TILE_SIZE);
  const tileCount = 2 ** zoom;
  for (let y = firstY; y <= lastY; y++) {
    if (y < 0 || y >= tileCount) continue;
    for (let x = firstX; x <= lastX; x++) {
      const tileX = ((x % tileCount) + tileCount) % tileCount;
      tiles.push(
        <img key={`${zoom}-${x}-${y}`} src={`https://tile.openstreetmap.org/${zoom}/${tileX}/${y}.png`}
          alt="" draggable={false} className="pointer-events-none absolute max-w-none select-none"
          style={{ width: TILE_SIZE, height: TILE_SIZE, left: x * TILE_SIZE - centerPixel.x + size.width / 2, top: y * TILE_SIZE - centerPixel.y + size.height / 2 }} />,
      );
    }
  }

  const selectedPixel = selected ? worldPoint(selected, zoom) : null;
  const markerLeft = selectedPixel ? selectedPixel.x - centerPixel.x + size.width / 2 : 0;
  const markerTop = selectedPixel ? selectedPixel.y - centerPixel.y + size.height / 2 : 0;

  const useCurrentLocation = () => {
    setError("");
    if (!navigator.geolocation) {
      setError("Location access is unavailable. Tap your delivery point on the map instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setCenter(point);
        setSelected(point);
      },
      () => setError("Location access failed. Tap your delivery point on the map instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="mt-3 rounded-xl border border-border bg-background p-3">
      <p className="text-sm font-semibold">Choose your delivery point</p>
      <p className="mt-1 text-xs text-muted-foreground">Tap the map to place the pin, or use your current location. Drag to move around.</p>
      <div ref={map} className="relative mt-3 h-80 w-full overflow-hidden rounded-lg bg-[#e5ebe3] cursor-crosshair"
        style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY, center, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const dx = event.clientX - drag.current.x;
          const dy = event.clientY - drag.current.y;
          if (Math.abs(dx) + Math.abs(dy) > 5) drag.current.moved = true;
          if (drag.current.moved) {
            const start = worldPoint(drag.current.center, zoom);
            setCenter(coordinatesAt(start.x - dx, start.y - dy, zoom));
          }
        }}
        onPointerUp={(event) => {
          const action = drag.current;
          drag.current = null;
          if (!action || action.moved) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          setSelected(coordinatesAt(centerPixel.x + event.clientX - bounds.left - bounds.width / 2,
            centerPixel.y + event.clientY - bounds.top - bounds.height / 2, zoom));
        }}
        onPointerCancel={() => { drag.current = null; }}>
        {tiles}
        {selectedPixel && markerLeft >= 0 && markerLeft <= size.width && markerTop >= 0 && markerTop <= size.height && (
          <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-full text-3xl drop-shadow-md"
            style={{ left: markerLeft, top: markerTop }} aria-hidden="true">📍</div>
        )}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer"
          className="absolute bottom-1 right-1 rounded bg-white/90 px-1 text-[10px] text-slate-700">© OpenStreetMap contributors</a>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setZoom((current) => Math.min(18, current + 1))} className="rounded-lg border border-border px-3 py-1 text-sm" aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setZoom((current) => Math.max(3, current - 1))} className="rounded-lg border border-border px-3 py-1 text-sm" aria-label="Zoom out">−</button>
        <button type="button" onClick={useCurrentLocation} className="rounded-lg border border-border px-3 py-1 text-sm">Use my location</button>
      </div>
      {selected && <p className="mt-2 text-xs text-muted-foreground" role="status">Pin selected: {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}</p>}
      {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => selected && onSave(selected)} disabled={!selected || saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Saving…" : "Use this location"}</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
      </div>
    </div>
  );
}
