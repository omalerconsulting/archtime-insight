import { describe, expect, it } from "vitest";
import { incomeVat } from "./income-vat";
import { buildLedger, type LedgerData } from "./pnl-ledger";
import { calculateForecast, type ForecastInput } from "./forecast-calculator";
const empty: LedgerData = { projects: [], milestones: [], commissions: [], incomes: [], incomeMs: [], expenses: [], adjustments: [] };
describe("income VAT basis", () => {
  it("adds VAT only to pre-VAT income for bank receipts", () => {
    expect(incomeVat(1000, { vat_rate: 18, vat_included: false })).toEqual({ net: 1000, gross: 1180, vat: 180 });
  });
  it("does not add VAT again to VAT-inclusive income", () => {
    expect(incomeVat(1180, { vat_rate: 18, vat_included: true })).toEqual({ net: 1000, gross: 1180, vat: 180 });
  });
  it("reconciles partial payments, forecasts and commissions on net income", () => {
    const data: LedgerData = { ...empty, projects: [{id:"p", code:"1", name:"p", fee_total:1180, vat_included:true, vat_rate:18}], milestones:[{id:"m",project_id:"p",title:"payment",amount_type:"percent",amount_value:100,status:"invoiced",paid_amount:590,paid_date:"2026-10-01",due_date:"2026-10-01"}], commissions:[{id:"c",project_id:"p",supplier_name:"c",amount:1000,paid_amount:0,paid_date:null,expected_date:"2026-10-01",vat_included:false,vat_rate:18}] };
    const row=buildLedger(data,2026)[9];
    expect(row.income).toBe(2000); expect(row.bankActual).toBe(590); expect(row.bankForecast).toBe(1770); expect(row.incomeVatTotal).toBe(360);
    expect(row.details.reduce((s,d)=>s+d.amount,0)).toBe(row.sourceIncome);
  });
  it("converts additional income to net without changing received gross", () => {
    const row=buildLedger({...empty,incomes:[{id:"i",source:"i",total_amount:1180,vat_included:true,vat_rate:18}],incomeMs:[{id:"m",income_id:"i",title:"p",amount_type:"fixed",amount_value:1180,status:"paid",paid_amount:1180,paid_date:"2026-10-01",due_date:"2026-10-01"}]},2026)[9];
    expect(row.income).toBe(1000); expect(row.bankActual).toBe(1180); expect(row.profit).toBe(1000);
  });
  it("preserves historical income until its VAT is reviewed", () => { expect(incomeVat(1180)).toEqual({net:1180,gross:1180,vat:0}); });
  it("calculates the same deal target for net and gross input", () => {
    const base: ForecastInput={target:7700,expenses:10000,nonDeductible:0,corporateRate:23,dividendRate:30,vatRate:18,inputVat:0,advanceRate:5,plannedRevenue:12000,averageDeal:10000,installmentPercent:50,scenario:"company"};
    const gross=calculateForecast({...base,averageDeal:11800,averageDealVatIncluded:true});
    expect(gross.deals).toBe(2); expect(gross.monthlyDeal).toBe(5000); expect(gross.customerGross).toBe(23600); expect(gross.requiredRevenue).toBe(calculateForecast(base).requiredRevenue);
  });
});