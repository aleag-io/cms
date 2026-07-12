/**
 * Presentation-edge money helpers. Integer cents (BIGINT) only.
 * No component should divide by 100 itself.
 */

export function formatCents(
  cents: bigint | number | string,
  currency = 'USD',
): string {
  let value: bigint;
  try {
    if (typeof cents === 'bigint') value = cents;
    else if (typeof cents === 'number' && Number.isSafeInteger(cents)) {
      value = BigInt(cents);
    } else if (typeof cents === 'string' && /^-?\d+$/.test(cents.trim())) {
      value = BigInt(cents.trim());
    } else {
      throw new Error('invalid cents');
    }
  } catch {
    return currency === 'USD' ? '$0.00' : '0';
  }

  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  const formattedWhole = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(whole);

  return `${negative ? '-' : ''}${formattedWhole}.${fraction}`;
}

/** Parse a dollar string ("12.34", "$1,234.56") to integer cents. Rejects fractional cents. */
export function parseCentsInput(input: string): bigint {
  const cleaned = input.trim().replace(/[$,\s]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '+') {
    throw new Error('Invalid money amount');
  }
  const neg = cleaned.startsWith('-');
  const raw = neg ? cleaned.slice(1) : cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error('Invalid money amount (use up to 2 decimal places)');
  }
  const [whole, frac = ''] = raw.split('.');
  const fracPadded = (frac + '00').slice(0, 2);
  const cents = BigInt(whole) * BigInt(100) + BigInt(fracPadded);
  return assertBigIntRange(neg ? -cents : cents);
}

/** JSON-safe serialization of cents (string avoids Number precision loss). */
export function centsToJson(cents: bigint): string {
  return cents.toString();
}

export function centsFromJson(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') return assertBigIntRange(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error('amountCents must be a safe integer number of cents');
    }
    return assertBigIntRange(BigInt(value));
  }
  if (!/^-?\d+$/.test(value.trim())) {
    throw new Error('amountCents must be an integer string');
  }
  return assertBigIntRange(BigInt(value.trim()));
}

const BIGINT_MIN = -9223372036854775808n;
const BIGINT_MAX = 9223372036854775807n;

function assertBigIntRange(value: bigint): bigint {
  if (value < BIGINT_MIN || value > BIGINT_MAX) {
    throw new Error('amountCents is outside the PostgreSQL BIGINT range');
  }
  return value;
}
