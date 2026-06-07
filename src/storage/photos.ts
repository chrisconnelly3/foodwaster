import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function savePhoto(dataDir: string, id: number, base64: string, ext = "jpg"): string {
  const dir = join(dataDir, "photos");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.${ext}`);
  writeFileSync(path, Buffer.from(base64, "base64"));
  return path;
}

export function readPhotoAsBase64(path: string): { base64: string; mediaType: string } {
  const buf = readFileSync(path);
  const mediaType = path.endsWith(".png") ? "image/png" : "image/jpeg";
  return { base64: buf.toString("base64"), mediaType };
}
