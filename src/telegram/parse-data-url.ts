export function parseDataUrl(
  dataUrl: string,
): { buffer: Buffer; mime: string; ext: string } | null {
  const trimmed = dataUrl.trim();
  const match = /^data:([^;]+);base64,(.+)$/s.exec(trimmed);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, '');
  if (!base64.length) return null;
  try {
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length < 8) return null;
    const ext =
      mime.includes('png')
        ? 'png'
        : mime.includes('webp')
          ? 'webp'
          : mime.includes('gif')
            ? 'gif'
            : 'jpg';
    return { buffer, mime, ext };
  } catch {
    return null;
  }
}
