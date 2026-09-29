export function formatArsCents(cents: number | null | undefined) {
  if (cents == null) return "Consultar";
  const hasDecimals = cents % 100 !== 0;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0
  }).format(cents / 100);
}

export function formatArsAmount(value: string) {
  const normalized = value.trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!normalized) return "";
  const amount = normalized.includes(",")
    ? Number(normalized.replace(/\./g, "").replace(",", "."))
    : Number(normalized);
  if (!Number.isFinite(amount)) return value;
  const cents = Math.round(amount * 100);
  return formatArsCents(cents);
}

export function formatArsInput(value: string) {
  const clean = value.replace(/[^\d,]/g, "");
  if (!clean) return "";
  const [integerPart = "", decimalPart] = clean.split(",", 2);
  const integer = integerPart.replace(/^0+(?=\d)/, "");
  const grouped = Number(integer || 0).toLocaleString("es-AR", {
    maximumFractionDigits: 0
  });
  const decimals = decimalPart === undefined ? "" : `,${decimalPart.slice(0, 2)}`;
  return `$${grouped}${decimals}`;
}
