/**
 * Utility to compress images client-side before uploading to Firestore/Firebase Storage.
 * It resizes images exceeding 1920px dimensions and compresses them to target under 1.5MB.
 * If the file is already under 1.5MB, it skips compression entirely to preserve quality and device CPU.
 */
export async function compressImage(file: File, maxMb: number = 1.5): Promise<File> {
  // If browser environment doesn't support FileReader or Canvas, return original file
  if (typeof window === "undefined" || !window.FileReader || !window.HTMLCanvasElement) {
    return file;
  }

  // Only compress common image formats
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return file;
  }

  // Skip compression if the file is already under 1.5MB
  const sizeInMb = file.size / (1024 * 1024);
  if (sizeInMb <= maxMb) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Standardize high-res phone camera shots down to 1920px max dimension
        const maxDimension = 1920;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Always export as image/jpeg to ensure the quality factor applies and compresses files
        // (PNG files don't support lossy compression in the browser and result in larger sizes)
        const exportType = "image/jpeg";
        const quality = 0.82; // 82% quality delivers great detail at 1/10th the file size

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }

            // If for some reason the compressed file is larger (e.g. tiny images), fallback to original
            if (blob.size >= file.size) {
              resolve(file);
              return;
            }

            // Standardize file extension to .jpg since we converted the canvas to JPEG
            let newName = file.name;
            const extIndex = newName.lastIndexOf(".");
            if (extIndex !== -1) {
              newName = newName.substring(0, extIndex) + ".jpg";
            } else {
              newName = newName + ".jpg";
            }

            const compressedFile = new File([blob], newName, {
              type: blob.type,
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          exportType,
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}
