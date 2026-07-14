/**
 * Pure helpers for donation-batch posting: sum credit lines per income account
 * and total a batch. Used by the batch-post orchestration to build one
 * consolidated deposit journal (debit cash total, credit each income account).
 */

export type BatchLine = { incomeAccountId: string; amountCents: bigint };

export function groupCreditsByAccount(
  lines: BatchLine[],
): { accountId: string; amountCents: bigint }[] {
  const map = new Map<string, bigint>();
  for (const l of lines) {
    map.set(l.incomeAccountId, (map.get(l.incomeAccountId) ?? 0n) + l.amountCents);
  }
  return [...map.entries()].map(([accountId, amountCents]) => ({ accountId, amountCents }));
}

export function batchTotalCents(lines: { amountCents: bigint }[]): bigint {
  return lines.reduce((a, l) => a + l.amountCents, 0n);
}
