export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function dollarsToCents(input: string): number {
  return Math.round(parseFloat(input) * 100);
}
