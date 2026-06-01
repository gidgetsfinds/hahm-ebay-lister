// Resize photos in the browser before upload. Keeps request payloads small
// (well under serverless limits) and matches the ~800-1024px the model needs —
// the same idea as _resize_for_claude() in the Python script.

const MAX_DIM = 1024;
const JPEG_QUALITY = 0.82;

export interface ResizedImage {
  mediaType: "image/jpeg";
  data: string; // base64 (no data-url prefix)
  previewUrl: string; // data url for <img>
}

export async function resizeImage(file: File): Promise<ResizedImage> {
  const bitmap = await loadBitmap(file);
  const { width, height } = scaleDown(bitmap.width, bitmap.height, MAX_DIM);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap) bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return {
    mediaType: "image/jpeg",
    data: dataUrl.split(",")[1],
    previewUrl: dataUrl,
  };
}

function scaleDown(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h };
  const ratio = Math.min(max / w, max / h);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to the <img> path (e.g. some HEIC/Safari cases).
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image file."));
    };
    img.src = url;
  });
}
