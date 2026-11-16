// Money is always stored as an integer number of cents to avoid floating-point
// rounding errors (0.1 + 0.2 !== 0.3).

/**
 * Parse a user- or bank-supplied amount into cents.
 * Accepts "1,234.56", "$1,234.56", "-12.30", "(12.30)", "12.30-", "+5", "USD 5".
 * Returns null when the text is not a valid amount.
 */
export function parseAmount(input: string): number | null {
	let s = input.replace(/\s+/g, '');
	if (!s) return null;

	// Drop currency symbols and codes, keeping digits, separators, signs and parentheses.
	s = s.replace(/[^\d.,()+-]/g, '');

	let negative = false;
	if (s.startsWith('(') && s.endsWith(')')) {
		negative = true;
		s = s.slice(1, -1);
	}
	if (s.endsWith('-')) {
		negative = !negative;
		s = s.slice(0, -1);
	}
	if (s.startsWith('-')) {
		negative = !negative;
		s = s.slice(1);
	} else if (s.startsWith('+')) {
		s = s.slice(1);
	}

	// Either "1,234,567.89" (thousands separators) or "1234567.89".
	if (!/^(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?$/.test(s) || s === '' || s === '.') return null;

	const [intPart = '', fracPart = ''] = s.replace(/,/g, '').split('.');
	let cents = Number(intPart || '0') * 100 + Number((fracPart + '00').slice(0, 2));
	// Round half up on the third decimal digit.
	if (fracPart.length > 2 && Number(fracPart[2]) >= 5) cents += 1;

	if (!Number.isSafeInteger(cents)) return null;
	return negative && cents !== 0 ? -cents : cents;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
	let f = formatters.get(currency);
	if (!f) {
		try {
			f = new Intl.NumberFormat(undefined, { style: 'currency', currency });
		} catch {
			f = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
		}
		formatters.set(currency, f);
	}
	return f;
}

/** Format cents as currency, e.g. -123456 → "-$1,234.56". */
export function formatMoney(cents: number, currency = 'USD'): string {
	return formatterFor(currency).format(cents / 100);
}

/** Format cents for an <input type="number"> field, e.g. 123456 → "1234.56". */
export function centsToInput(cents: number): string {
	return (cents / 100).toFixed(2);
}
