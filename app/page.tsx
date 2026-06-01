"use client";

import { useCallback, useRef, useState } from "react";
import { resizeImage, type ResizedImage } from "@/lib/resize";
import type { AnalyzeResponse, ListingResult } from "@/lib/types";
import { ResultCard } from "./ResultCard";

const PROFILES = [
  { value: "auto", label: "Auto-detect (recommended)" },
  { value: "clothing", label: "Clothing / Shoes / Accessories" },
  { value: "hard_goods", label: "Hard Goods / Electronics / Home" },
  { value: "collectibles", label: "Collectibles / Toys" },
  { value: "art", label: "Art" },
  { value: "media", label: "Books / Music / Movies / Games" },
];

const MAX_PHOTOS = 12;

export default function Home() {
  const [images, setImages] = useState<ResizedImage[]>([]);
  const [profile, setProfile] = useState("auto");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ListingResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    const files = Array.from(fileList).filter((f) =>
      f.type.startsWith("image/")
    );
    if (files.length === 0) {
      setError("Those didn't look like photos. Use JPG, PNG, or WebP.");
      return;
    }
    try {
      const resized = await Promise.all(files.map(resizeImage));
      setImages((prev) => [...prev, ...resized].slice(0, MAX_PHOTOS));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const removeImage = (idx: number) =>
    setImages((prev) => prev.filter((_, i) => i !== idx));

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void addFiles(e.dataTransfer.files);
  };

  const analyze = async () => {
    if (images.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          images: images.map((i) => ({ mediaType: i.mediaType, data: i.data })),
        }),
      });
      const data = (await res.json()) as AnalyzeResponse;
      if (!data.ok || !data.listing) {
        throw new Error(data.error || "Could not write the listing.");
      }
      setResult(data.listing);
      // Scroll the result into view on the next paint.
      requestAnimationFrame(() => {
        document
          .getElementById("result")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setImages([]);
    setResult(null);
    setError(null);
    setProfile("auto");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <main className="wrap">
      <header className="masthead">
        <span className="logo-mark" aria-hidden="true">
          🪄
        </span>
        <div>
          <h1>Listing Writer</h1>
          <p>Photos in, ready-to-post eBay listing out.</p>
        </div>
      </header>

      <section className="hero">
        <h2>
          Snap it, upload it, <em>list it.</em>
        </h2>
        <p>
          Drop in a few photos of one item — tags, close-ups, the works — and
          get a polished title, description, and item details you can paste
          straight into eBay.
        </p>
      </section>

      <section className="panel" aria-labelledby="upload-heading">
        <h2 id="upload-heading" className="section-label">
          1 · Add this item&rsquo;s photos
        </h2>

        <div
          className={`dropzone${dragging ? " dragging" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <span className="icon" aria-hidden="true">
            📸
          </span>
          <strong>Tap to choose photos, or drag them here</strong>
          <span>Up to {MAX_PHOTOS} photos of the same item · JPG, PNG, WebP</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void addFiles(e.target.files)}
          />
        </div>

        {images.length > 0 && (
          <div className="thumbs" aria-label="Selected photos">
            {images.map((img, idx) => (
              <div className="thumb" key={idx}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.previewUrl} alt={`Item photo ${idx + 1}`} />
                <button
                  type="button"
                  aria-label={`Remove photo ${idx + 1}`}
                  onClick={() => removeImage(idx)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="controls">
          <div className="field">
            <label htmlFor="profile">What kind of item is it?</label>
            <select
              id="profile"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
            >
              {PROFILES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={analyze}
            disabled={images.length === 0 || loading}
          >
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Writing your listing…
              </>
            ) : (
              <>✍️ Write my listing</>
            )}
          </button>
        </div>

        {error && (
          <p className="note note-error" role="alert">
            {error}
          </p>
        )}
      </section>

      {loading && (
        <section className="panel">
          <div className="loading-card">
            <span className="spinner" aria-hidden="true" />
            <span>
              Reading your photos and writing the listing — this usually takes
              15&ndash;40 seconds.
            </span>
          </div>
        </section>
      )}

      {result && (
        <ResultCard result={result} onReset={reset} />
      )}

      <p className="footnote">
        Your photos are sent securely to write the listing and are not stored.
        Phase 2 will add one-click posting to eBay.
      </p>
    </main>
  );
}
