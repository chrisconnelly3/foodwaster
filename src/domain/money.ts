export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
export function dollarsToCents(input: string): number {
  return Math.round(parseFloat(input) * 100);
}
