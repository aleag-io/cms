/**
 * Strip secrets from ContextualShare API responses.
 * Raw tokens are only returned once at create time; hashes never leave the API.
 */
export function publicShare<T extends { tokenHash?: string | null }>(
  share: T,
): Omit<T, 'tokenHash'> {
  const { tokenHash: _ignored, ...rest } = share;
  void _ignored;
  return rest;
}
