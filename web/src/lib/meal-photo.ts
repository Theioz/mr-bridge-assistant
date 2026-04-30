// Compresses large food/meal images before uploading to analyze-photo.
// Skips canvas work for files already under 2 MB. For larger files, tries
// quality 0.82 first; if the result is still > 4.5 MB retries at 0.70.
// createImageBitmap is tried first — it handles Ultra HDR JPEGs (Pixel 9 Pro
// 50 MP / Google HDR Gain Map) that cause img.onerror or toBlob(null) in the
// standard <img>+canvas pipeline. Falls back to <img> for older browsers.
export async function compressImage(file: File): Promise<Blob> {
  const THRESHOLD = 2 * 1024 * 1024;
  if (file.size <= THRESHOLD) return file;

  const MAX_EDGE = 1920;

  function scaleToCanvas(
    source: HTMLImageElement | ImageBitmap,
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
    let width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    let height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    if (width > MAX_EDGE || height > MAX_EDGE) {
      if (width >= height) {
        height = Math.round((height * MAX_EDGE) / width);
        width = MAX_EDGE;
      } else {
        width = Math.round((width * MAX_EDGE) / height);
        height = MAX_EDGE;
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, width, height);
    return { canvas, ctx };
  }

  function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Compression failed"));
          if (blob.size <= 4.5 * 1024 * 1024) return resolve(blob);
          canvas.toBlob(
            (blob2) => {
              if (blob2) resolve(blob2);
              else reject(new Error("Compression failed"));
            },
            "image/jpeg",
            0.7,
          );
        },
        "image/jpeg",
        0.82,
      );
    });
  }

  if (typeof createImageBitmap !== "undefined") {
    try {
      const bitmap = await createImageBitmap(file);
      const result = scaleToCanvas(bitmap);
      bitmap.close();
      if (!result) throw new Error("Canvas unavailable");
      return blobFromCanvas(result.canvas);
    } catch {
      // fall through to <img> fallback
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const result = scaleToCanvas(img);
      if (!result) return reject(new Error("Canvas unavailable"));
      blobFromCanvas(result.canvas).then(resolve).catch(reject);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for compression"));
    };
    img.src = objectUrl;
  });
}
