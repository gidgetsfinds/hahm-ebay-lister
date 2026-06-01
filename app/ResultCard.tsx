"use client";

import { useEffect, useMemo, useState } from "react";
import type { ListingResult } from "@/lib/types";

const TITLE_LIMIT = 80;

function formatPrice(value: number | string | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (n === undefined || Number.isNaN(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function asColor(color: ListingResult["color"]): string {
  if (Array.isArray(color)) return color.filter(Boolean).join(", ");
  return color ?? "";
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      className="btn-ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          /* clipboard blocked — no-op */
        }
      }}
    >
      {copied ? "✓ Copied" : `📋 Copy ${label}`}
    </button>
  );
}

export function ResultCard({
  result,
  onReset,
}: {
  result: ListingResult;
  onReset: () => void;
}) {
  const [title, setTitle] = useState(result.title ?? "");
  const [description, setDescription] = useState(result.description ?? "");

  const specifics = useMemo(() => {
    const entries = Object.entries(result.item_specifics ?? {});
    return entries.filter(
      ([k, v]) => v && v.trim() !== "" && !k.startsWith("---")
    );
  }, [result.item_specifics]);

  const titleOver = title.length > TITLE_LIMIT;

  const downloadJson = () => {
    const payload = { ...result, title, description };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const safeName =
      (title || "listing")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50) || "listing";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel" id="result" aria-labelledby="result-heading">
      <div className="result-head">
        <h3 id="result-heading">Your listing is ready</h3>
        {result.item_profile && (
          <span className="badge">{result.item_profile.replace(/_/g, " ")}</span>
        )}
      </div>

      <div className="result-grid">
        {/* Title */}
        <div className="result-field">
          <label htmlFor="r-title">
            Title
            <span className={`count${titleOver ? " over" : ""}`}>
              {title.length}/{TITLE_LIMIT}
            </span>
          </label>
          <input
            id="r-title"
            type="text"
            className="title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="copy-row">
            <CopyButton text={title} label="title" />
          </div>
        </div>

        {/* Key stats */}
        <div className="meta-row">
          <div className="stat">
            <div className="k">Suggested price</div>
            <div className="v price">{formatPrice(result.suggested_price)}</div>
          </div>
          <div className="stat">
            <div className="k">Condition</div>
            <div className="v">
              {(result.condition ?? "—").replace(/_/g, " ")}
            </div>
          </div>
          {result.brand && (
            <div className="stat">
              <div className="k">Brand</div>
              <div className="v">{result.brand}</div>
            </div>
          )}
          {result.size && (
            <div className="stat">
              <div className="k">Size</div>
              <div className="v">{result.size}</div>
            </div>
          )}
        </div>

        {/* Category hint */}
        {(result.category_hint || result.item_type) && (
          <div className="result-field">
            <label>Suggested eBay category</label>
            <p style={{ margin: 0 }}>
              {result.category_hint || result.item_type}
              {asColor(result.color) && (
                <span style={{ color: "var(--color-ink-faint)" }}>
                  {" "}
                  · {asColor(result.color)}
                </span>
              )}
            </p>
          </div>
        )}

        {/* Description */}
        <div className="result-field">
          <label htmlFor="r-desc">Description</label>
          <textarea
            id="r-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={10}
          />
          <div className="copy-row">
            <CopyButton text={description} label="description" />
          </div>
        </div>

        {/* Condition notes */}
        {result.condition_notes && (
          <div className="result-field">
            <label>Condition notes</label>
            <p style={{ margin: 0, color: "var(--color-ink-soft)" }}>
              {result.condition_notes}
            </p>
          </div>
        )}

        {/* Item specifics */}
        {specifics.length > 0 && (
          <div className="result-field">
            <label>Item specifics</label>
            <div className="specifics">
              {specifics.map(([k, v]) => (
                <div className="row" key={k}>
                  <span className="k">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Keywords */}
        {result.seo_keywords && result.seo_keywords.length > 0 && (
          <div className="result-field">
            <label>Search keywords</label>
            <div className="chips">
              {result.seo_keywords.map((kw, i) => (
                <span className="chip" key={i}>
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Features */}
        {result.key_features && result.key_features.length > 0 && (
          <div className="result-field">
            <label>Key features</label>
            <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
              {result.key_features.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="result-actions">
        <button type="button" className="btn btn-ghost" onClick={downloadJson}>
          ⬇️ Download as file
        </button>
        <button type="button" className="btn btn-ghost" onClick={onReset}>
          ↺ Start a new item
        </button>
      </div>
    </section>
  );
}
