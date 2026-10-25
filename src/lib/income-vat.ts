export type VatBasis = { vat_included?: boolean; vat_rate?: number };
export function incomeVat(amount: number, basis: VatBasis = {}) {
  const rate = Number(basis.vat_rate ?? 0);
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("סכום או שיעור מע״מ לא תקינים");
  const net = basis.vat_included ? amount / (1 + rate / 100) : amount;
  const gross = basis.vat_included ? amount : amount * (1 + rate / 100);
  return { net, gross, vat: gross - net };
}