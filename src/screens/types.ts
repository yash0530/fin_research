/** The fields of an InsiderTx row the cluster screen actually reads. */
export interface InsiderTxLike {
  filerName: string;
  filerRole: string;
  txDate: string;
  value: number;
  tenPercentOwner: number;
  tenB51: number;
}

export interface FundamentalsQuarter {
  symbol: string;
  periodEnd: string;
  revenue?: number | null;
  grossProfit?: number | null;
  operatingIncome?: number | null;
  netIncome?: number | null;
  fcf?: number | null;
  capex?: number | null;
  totalAssets?: number | null;
  totalDebt?: number | null;
  cash?: number | null;
  equity?: number | null;
  sharesOut?: number | null;
  cfo?: number | null;
  sga?: number | null;
  depreciation?: number | null;
  receivables?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
  retainedEarnings?: number | null;
  ppe?: number | null;
}
