export interface IdentifyResult {
  product_name: string;
  brand: string | null;
  category: string | null; // produce|dairy|meat|bakery|pantry|frozen|beverage|other
  confidence: number;      // 0..1
}
