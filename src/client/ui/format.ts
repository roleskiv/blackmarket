/** Money and time formatting. Amounts are integers in minor units. */
export interface Currency {
  code: string;
  decimals: number;
}

export function makeMoneyFormatter(currency: Currency, locale = navigator.language): (minor: number) => string {
  const div = 10 ** currency.decimals;
  const digits = { minimumFractionDigits: currency.decimals, maximumFractionDigits: currency.decimals };
  let real = false;
  try {
    real = Intl.supportedValuesOf('currency').includes(currency.code);
  } catch {
    real = /^[A-Z]{3}$/.test(currency.code) && currency.code !== 'FUN';
  }
  // Demo credits ("FUN") are not a currency: show a plain grouped number.
  const fmt = real
    ? new Intl.NumberFormat(locale, { style: 'currency', currency: currency.code, ...digits })
    : new Intl.NumberFormat(locale, digits);
  return (minor) => fmt.format(minor / div);
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
