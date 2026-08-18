"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GlassButton } from "@/components/ui/glass-button";

const VIEWPORT_WIDTH = 320;

type Vec = { x: number; y: number };

export function ImageCropPicker({
  file,
  aspect,
  onConfirm,
  onCancel,
}: {
  file: File;
  aspect: number;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const viewportHeight = Math.round(VIEWPORT_WIDTH / aspect);

  const imgRef = useRef<HTMLImageElement>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Vec>({ x: 0, y: 0 });
  const dragState = useRef<{ start: Vec; startOffset: Vec } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseScale = useMemo(() => {
    if (!natural) return 1;
    return Math.max(VIEWPORT_WIDTH / natural.w, viewportHeight / natural.h);
  }, [natural, viewportHeight]);

  const effectiveScale = baseScale * zoom;

  const renderedSize = useMemo(() => {
    if (!natural) return { w: 0, h: 0 };
    return { w: natural.w * effectiveScale, h: natural.h * effectiveScale };
  }, [natural, effectiveScale]);

  function clamp(offsetVal: Vec, size: { w: number; h: number }): Vec {
    const minX = Math.min(0, VIEWPORT_WIDTH - size.w);
    const minY = Math.min(0, viewportHeight - size.h);
    return {
      x: Math.min(0, Math.max(minX, offsetVal.x)),
      y: Math.min(0, Math.max(minY, offsetVal.y)),
    };
  }

  function handleImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNatural({ w, h });
    const scale = Math.max(VIEWPORT_WIDTH / w, viewportHeight / h);
    setOffset({
      x: (VIEWPORT_WIDTH - w * scale) / 2,
      y: (viewportHeight - h * scale) / 2,
    });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { start: { x: e.clientX, y: e.clientY }, startOffset: offset };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.start.x;
    const dy = e.clientY - dragState.current.start.y;
    const next = {
      x: dragState.current.startOffset.x + dx,
      y: dragState.current.startOffset.y + dy,
    };
    setOffset(clamp(next, renderedSize));
  }

  function handlePointerUp() {
    dragState.current = null;
  }

  function handleZoomChange(next: number) {
    setZoom(next);
    if (!natural) return;
    const scale = baseScale * next;
    const size = { w: natural.w * scale, h: natural.h * scale };
    setOffset((prev) => clamp(prev, size));
  }

  function handleConfirm() {
    if (!natural || !imgRef.current) return;

    const cropX = -offset.x / effectiveScale;
    const cropY = -offset.y / effectiveScale;
    const cropW = VIEWPORT_WIDTH / effectiveScale;
    const cropH = viewportHeight / effectiveScale;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cropW);
    canvas.height = Math.round(cropH);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(
      imgRef.current,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
      },
      "image/jpeg",
      0.92
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/30 bg-white/40 p-3">
      <p className="text-xs text-slate-600">
        Geser untuk atur posisi, gunakan slider untuk zoom. Bagian di luar
        kotak akan terpotong.
      </p>
      <div
        className="relative mx-auto touch-none select-none overflow-hidden rounded-lg border-2 border-[#35C5D0] bg-slate-200"
        style={{ width: VIEWPORT_WIDTH, height: viewportHeight }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {imgUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={imgUrl}
            alt=""
            onLoad={handleImgLoad}
            draggable={false}
            className="absolute cursor-move"
            style={{
              left: offset.x,
              top: offset.y,
              width: renderedSize.w || undefined,
              height: renderedSize.h || undefined,
              maxWidth: "none",
            }}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600">Zoom</span>
        <input
          type="range"
          min={1}
          max={4}
          step={0.05}
          value={zoom}
          onChange={(e) => handleZoomChange(Number(e.target.value))}
          className="flex-1"
        />
      </div>
      <div className="flex gap-2">
        <GlassButton
          type="button"
          onClick={handleConfirm}
          className="!bg-[#35C5D0] px-4 py-1.5 text-sm !text-white hover:!bg-[#2bb0ba]"
        >
          Terapkan Crop
        </GlassButton>
        <GlassButton type="button" onClick={onCancel} className="px-4 py-1.5 text-sm">
          Batal
        </GlassButton>
      </div>
    </div>
  );
}
