"use client";

import { useRef, useState } from "react";

export function VideoAdsPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  return (
    <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-3xl border border-white/40 shadow-[0_20px_60px_rgba(23,38,61,0.25)]">
      <video
        ref={videoRef}
        src={src}
        autoPlay
        muted
        loop
        playsInline
        className="aspect-video w-full object-cover"
      />
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? "Aktifkan suara" : "Matikan suara"}
        className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/30 text-white shadow-sm backdrop-blur-xl transition hover:bg-white/40"
      >
        {muted ? (
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L18.73 21 20 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
          </svg>
        )}
      </button>
    </div>
  );
}
