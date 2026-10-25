import { describe, it, expect } from "vitest";
import { buildLedger, forecastMonths, expenseAlerts, validDate, type Expense, type LedgerData } from "./pnl-ledger";
import { findDuplicates, suggestRecurring } from "./finance-review";
const expense: Expense = { id: "rent", category: "rent", description: "rent", vendor: null, amount: 1000, expense_date: "2027-01-15", is_recurring: true, recurring_until: "2027-03-31", notes: null };
const empty: LedgerData = { projects: [], milestones: [], commissions: [], incomes: [], incomeMs: [], expenses: [], adjustments: [] };
describe("accounting rules", () => {
  it("repeats rent in its months only, including the ending month", () => {
    const rows = buildLedger({ ...empty, expenses: [expense] }, 2027);
    expect(rows.map(r => r.totalExpenses)).toEqual([1000,1000,1000,0,0,0,0,0,0,0,0,0]);
    expect(rows[1].details[0].amount).toBe(1000);
  });
  it("matches every detail to its monthly bucket, including commissions", () => {
    const rows = buildLedger({ ...empty, commissions: [{ id: "c", project_id: "p", supplier_name: "supplier", amount: 500, paid_amount: 200, paid_date: "2027-01-10", expected_date: "2027-02-01" }] }, 2027);
    expect(rows[0].projectActual).toBe(200); expect(rows[1].projectForecast).toBe(300);
    rows.forEach(r => expect(r.details.filter(d => d.bucket !== "expenses").reduce((s,d) => s+d.amount,0)).toBe(r.sourceIncome));
  });
  it("totals income and profit from actual receipts only, excluding forecast", () => {
    const rows = buildLedger({ ...empty, projects: [{ id: "p", code: "1", name: "p", fee_total: 1000 }], milestones: [
      { id: "paid", project_id: "p", title: "paid", amount_type: "fixed", amount_value: 400, status: "paid", paid_amount: 400, paid_date: "2027-01-10", due_date: "2027-01-10" },
      { id: "pending", project_id: "p", title: "pending", amount_type: "fixed", amount_value: 600, status: "pending", paid_amount: 0, paid_date: null, due_date: "2027-01-20" },
    ], expenses: [expense] }, 2027);
    expect(rows[0].income).toBe(400); expect(rows[0].projectForecast).toBe(600); expect(rows[0].profit).toBe(-600);
    expect(rows[0].details.filter(d => d.bucket !== "expenses").reduce((s,d) => s+d.amount,0)).toBe(rows[0].sourceIncome);
  });
  it("reconciles manual overrides as a difference, without duplicating income", () => {
    const row = buildLedger({ ...empty, expenses: [expense], adjustments: [{ month: "2027-01-01", income_override: 5000, expense_override: 1200, note: "adjustment" }] }, 2027)[0];
    expect(row.incomeDelta).toBe(5000); expect(row.expenseDelta).toBe(200); expect(row.profit).toBe(3800);
  });
  it("flags missing salaries and rent when absent from a recorded completed month", () => {
    const alerts = expenseAlerts([{ ...expense, category: "general", is_recurring: false }], 2027, "2027-02-01");
    expect(alerts.map(a => a.key)).toEqual(["2027-01-rent", "2027-01-salaries"]);
  });
  it("detects significant differences but never compares incomplete or future months", () => {
    const alerts = expenseAlerts([{ ...expense, is_recurring: false }, { ...expense, id: "2", amount: 1600, expense_date: "2027-02-15", is_recurring: false }], 2027, "2027-03-01");
    expect(alerts.find(a => a.key === "2027-02-variance")?.text).toContain("60%");
    expect(alerts.some(a => a.month >= "2027-03")).toBe(false);
  });
  it("rejects impossible imported dates", () => { expect(validDate("2027-02-30")).toBe(false); expect(validDate("2027-02-28")).toBe(true); });
  it("places temporary expenses in their chosen month only", () => {
    expect(buildLedger({...empty,expenses:[{...expense,is_recurring:false}]},2027).map(r=>r.totalExpenses)).toEqual([1000,0,0,0,0,0,0,0,0,0,0,0]);
  });
  it("clamps automatic fixed-expense placement to the last real day", () => {
    expect(buildLedger({...empty,expenses:[{...expense,expense_date:"2027-01-31"}]},2027)[1].details[0].date).toBe("2027-02-28");
  });
  it("forecasts income minus expenses for current and next month across year end", () => {
    const data = {...empty,expenses:[{...expense,expense_date:"2027-12-01",recurring_until:null}], adjustments:[{month:"2027-12-01",income_override:3000,expense_override:null,note:null},{month:"2028-01-01",income_override:4000,expense_override:null,note:null}]};
    const result = forecastMonths(data,"2027-12-15");
    expect(result.current.profit).toBe(2000); expect(result.next.profit).toBe(3000); expect(result.next.key).toBe("2028-01");
  });
  it("detects expenses overlapping fixed entries but not separate temporary dates", () => {
    expect(findDuplicates([expense,{...expense,id:"b",is_recurring:false,expense_date:"2027-02-20"}],[])).toHaveLength(1);
    expect(findDuplicates([{...expense,is_recurring:false},{...expense,id:"b",is_recurring:false,expense_date:"2027-02-20"}],[])).toHaveLength(0);
  });
  it("detects duplicate income and resets an approval fingerprint after correction", () => {
    const a={id:"a",source:"ייעוץ",client_name:"לקוח",total_amount:500};
    const b={...a,id:"b"};
    const pairs=findDuplicates([],[a,b]); expect(pairs).toHaveLength(1);
    expect(findDuplicates([],[a,{...b,total_amount:600}])).toHaveLength(0);
    expect(findDuplicates([],[a,b])[0].key).toBe(pairs[0].key);
  });
  it("suggests fixed costs and follows an existing vendor classification", () => {
    expect(suggestRecurring("rent","",[])).toBe(true);
    expect(suggestRecurring("travel","",[])).toBe(false);
    expect(suggestRecurring("rent","ספק",[{...expense,vendor:"ספק",is_recurring:false}])).toBe(false);
  });
});