import { describe,it,expect } from "vitest";
import { calculateForecast, type ForecastInput } from "./forecast-calculator";
const base: ForecastInput={target:7700,expenses:10000,nonDeductible:0,corporateRate:23,dividendRate:30,vatRate:18,inputVat:1000,advanceRate:5,plannedRevenue:12000,averageDeal:10000,installmentPercent:50,scenario:"company"};
describe("company forecast assumptions",()=>{
 it("reverse-calculates retained company profit after expenses and corporate tax",()=>{const r=calculateForecast(base);expect(r.requiredRevenue).toBeCloseTo(20000);expect(r.corporateTax).toBeCloseTo(2300);expect(r.retained).toBeCloseTo(7700);});
 it("shows entire balance after dividend tax and reverse-solves the personal target",()=>{const r=calculateForecast(base);expect(r.dividendTax).toBeCloseTo(2310);expect(r.netDividend).toBeCloseTo(5390);const n=calculateForecast({...base,target:5390,scenario:"dividend"});expect(n.requiredRevenue).toBeCloseTo(20000);expect(n.netDividend).toBeCloseTo(5390);});
 it("does not subtract VAT or tax advances twice from profit",()=>{const r=calculateForecast(base);expect(r.vatPayment).toBeCloseTo(2600);expect(r.advance).toBeCloseTo(1000);expect(r.authorityCash).toBeCloseTo(3600);expect(r.retained).toBeCloseTo(7700);});
 it("accounts for non-deductible expenses in the taxable base",()=>{const r=calculateForecast({...base,nonDeductible:1000});expect(r.retained).toBeCloseTo(7700);expect(r.requiredRevenue).toBeGreaterThan(20000);});
 it("calculates deals from the monthly collectible installment not full contract value",()=>{const r=calculateForecast(base);expect(r.gap).toBeCloseTo(8000);expect(r.deals).toBe(2);expect(r.newContractValue).toBeCloseTo(16000);});
 it("rejects impossible rates and zero collection shares",()=>{expect(()=>calculateForecast({...base,corporateRate:100})).toThrow();expect(()=>calculateForecast({...base,installmentPercent:0})).toThrow();});
});