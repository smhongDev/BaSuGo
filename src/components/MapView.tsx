"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";

type Props = {
  center: [number, number];
  zoom?: number;
  marker?: [number, number] | null;
  /** 지도를 눌러 위치를 고르게 하려면 넘긴다 */
  onPick?: (lat: number, lng: number) => void;
  /** GPX 경로 */
  track?: [number, number][];
  height?: number;
  label: string;
};

const KOREA_CENTER: [number, number] = [36.2, 127.8];

export function MapView({ center, zoom = 11, marker, onPick, track, height = 320, label }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const lib = useRef<typeof Leaflet | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  // 지도 만들기 (한 번)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      lib.current = L;
      const m = L.map(el.current, { center, zoom, scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      m.on("click", (e: Leaflet.LeafletMouseEvent) => pickRef.current?.(e.latlng.lat, e.latlng.lng));
      map.current = m;
      draw();
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const L = lib.current;
    const m = map.current;
    const g = layer.current;
    if (!L || !m || !g) return;
    g.clearLayers();
    if (track && track.length > 1) {
      const line = L.polyline(track, { color: "#0078d7", weight: 4 }).addTo(g);
      L.circleMarker(track[0], { radius: 7, color: "#fff", weight: 2, fillColor: "#16a34a", fillOpacity: 1 }).addTo(g);
      L.circleMarker(track[track.length - 1], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: "#dc2626",
        fillOpacity: 1,
      }).addTo(g);
      m.fitBounds(line.getBounds(), { padding: [24, 24] });
    } else if (marker) {
      L.circleMarker(marker, { radius: 10, color: "#fff", weight: 3, fillColor: "#0078d7", fillOpacity: 1 }).addTo(g);
      m.setView(marker, Math.max(m.getZoom(), zoom));
    }
  }

  // 위치·경로가 바뀌면 다시 그린다
  useEffect(draw, [marker?.[0], marker?.[1], track]);

  return (
    <div
      ref={el}
      role="application"
      aria-label={label}
      className="map"
      style={{ height }}
      data-center={(marker ?? center ?? KOREA_CENTER).join(",")}
    />
  );
}

export { KOREA_CENTER };
