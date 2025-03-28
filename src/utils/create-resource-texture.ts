export function createResourceTexture(bgColor: string, detailColor: string, targetImage: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // Draw the background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 64, 64);

  // Add some texture details
  ctx.fillStyle = detailColor;
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * 64;
    const y = Math.random() * 64;
    const size = 3 + Math.random() * 6;
    ctx.fillRect(x, y, size, size);
  }

  // Set the resource image source to this canvas
  targetImage.src = canvas.toDataURL();
}
