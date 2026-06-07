import type { WasteItem } from "../types.js";
import type { IdentifyResult } from "./types.js";

export interface IdentifyDeps {
  lookupBarcode: (barcode: string) => Promise<IdentifyResult | null>;
  identifyPhoto: (base64: string, mediaType: string) => Promise<IdentifyResult | null>;
  readPhoto: (path: string) => Promise<{ base64: string; mediaType: string }>;
}

export async function identifyItem(item: WasteItem, deps: IdentifyDeps): Promise<IdentifyResult | null> {
  if (item.capture_type === "barcode" && item.barcode) {
    return deps.lookupBarcode(item.barcode);
  }
  if (item.capture_type === "photo" && item.photo_path) {
    const { base64, mediaType } = await deps.readPhoto(item.photo_path);
    return deps.identifyPhoto(base64, mediaType);
  }
  return null;
}
