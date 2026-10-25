export type ForecastInput = { target: number; expenses: number; nonDeductible: number; corporateRate: number; dividendRate: number; vatRate: number; inputVat: number; advanceRate: number; plannedRevenue: number; averageDeal: number; installmentPercent: number; scenario: "company" | "dividend" };
export function calculateForecast(i: ForecastInput) {
  for (const value of [i.target,i.expenses,i.nonDeductible,i.inputVat,i.plannedRevenue,i.averageDeal]) if (!Number.isFinite(value) || value < 0) throw new Error("סכומים חייבים להיות תקינים ולא שליליים");
  for (const value of [i.corporateRate,i.dividendRate]) if (!Number.isFinite(value) || value < 0 || value >= 100) throw new Error("שיעורי מס חייבים להיות בין 0 לפחות מ־100");
  for (const value of [i.vatRate,i.advanceRate,i.installmentPercent]) if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("אחוזים חייבים להיות בין 0 ל־100");
  if (i.nonDeductible > i.expenses || i.installmentPercent <= 0 || i.averageDeal <= 0) throw new Error("בדקו הוצאות לא מוכרות, סכום עסקה ואחוז גבייה");
  const c=i.corporateRate/100,d=i.dividendRate/100;
  const retainedTarget=i.scenario === "dividend" ? i.target/(1-d) : i.target;
  const requiredRevenue=i.expenses+(retainedTarget+c*i.nonDeductible)/(1-c);
  const preTax=requiredRevenue-i.expenses;
  const corporateTax=Math.max(0,preTax+i.nonDeductible)*c;
  const retained=preTax-corporateTax;
  const dividendTax=retained*d;
  const netDividend=retained-dividendTax;
  const outputVat=requiredRevenue*i.vatRate/100;
  const vatPayment=Math.max(0,outputVat-i.inputVat);
  const vatCredit=Math.max(0,i.inputVat-outputVat);
  const advance=requiredRevenue*i.advanceRate/100;
  const gap=Math.max(0,requiredRevenue-i.plannedRevenue);
  const monthlyDeal=i.averageDeal*i.installmentPercent/100;
  const deals=Math.ceil(gap/monthlyDeal);
  return { requiredRevenue,preTax,corporateTax,retained,dividendTax,netDividend,outputVat,vatPayment,vatCredit,advance,gap,monthlyDeal,deals,newContractValue:gap/(i.installmentPercent/100),taxProvision:corporateTax+vatPayment,authorityCash:advance+vatPayment,corporateBalance:corporateTax-advance,customerGross:requiredRevenue+outputVat };
}