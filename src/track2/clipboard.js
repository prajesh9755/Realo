/**
 * Clipboard paste is the primary input: it carries real pixel data, so CORS
 * never applies. Dragging an image usually transfers only a URL, which most
 * e-commerce CDNs refuse to serve cross-origin.
 */
export function onImageInput(handler, { dropZone, fileInput } = {}) {
  window.addEventListener('paste', (e) => {
    const file = imageFromClipboard(e.clipboardData);
    if (file) {
      e.preventDefault();
      handler(file, 'paste');
    }
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handler(file, 'file');
  });

  if (dropZone) {
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

    dropZone.addEventListener('dragover', (e) => {
      stop(e);
      dropZone.classList.add('is-over');
    });
    dropZone.addEventListener('dragleave', (e) => {
      stop(e);
      dropZone.classList.remove('is-over');
    });
    dropZone.addEventListener('drop', (e) => {
      stop(e);
      dropZone.classList.remove('is-over');
      const file = e.dataTransfer?.files?.[0];
      if (file?.type.startsWith('image/')) handler(file, 'drop');
      else handler(null, 'drop-unsupported');
    });
  }
}

function imageFromClipboard(clipboardData) {
  if (!clipboardData) return null;
  for (const item of clipboardData.items ?? []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

/** Alpha bounding box: gives the cutout's true proportions, so the user sets only one number. */
export async function measureAlphaBounds(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // A fully transparent or fully opaque result still has usable full-frame bounds.
  if (maxX < 0) {
    bitmap.close?.();
    return { width: bitmap.width, height: bitmap.height, aspect: bitmap.width / bitmap.height, cropped: false };
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  bitmap.close?.();
  return { x: minX, y: minY, width, height, aspect: width / height, cropped: true };
}

/** Trim to the alpha bounds so the plane has no dead transparent margin. */
export async function cropToBounds(blob, bounds) {
  if (!bounds.cropped) return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bounds.width;
  canvas.height = bounds.height;
  canvas.getContext('2d').drawImage(
    bitmap,
    bounds.x, bounds.y, bounds.width, bounds.height,
    0, 0, bounds.width, bounds.height
  );
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? blob), 'image/png'));
}
