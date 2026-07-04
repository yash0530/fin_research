-- Add canonical QoE fields to FundamentalsQuarter table.
-- Nullable REAL columns representing Cash Flow from Operations, SG&A expenses,
-- Depreciation/depletion/amortization, Receivables, Current Assets, Current Liabilities,
-- Retained Earnings, and Property/Plant/Equipment (Net).
ALTER TABLE "FundamentalsQuarter" ADD COLUMN "cfo" REAL;
ALTER TABLE "FundamentalsQuarter" ADD COLUMN "sga" REAL;
ALTER TABLE "FundamentalsQuarter" ADD COLUMN "depreciation" REAL;
ALTER TABLE "FundamentalsQuarter" ADD COLUMN "receivables" REAL;
ALTER TABLE "FundamentalsQuarter" ADD COLUMN "currentAssets" REAL;
ALTER TABLE "FundamentalsQuarter" ADD COLUMN "currentLiabilities" REAL;
ALTER TABLE "FundamentalsQuarter" ADD COLUMN "retainedEarnings" REAL;
ALTER TABLE "FundamentalsQuarter" ADD COLUMN "ppe" REAL;
