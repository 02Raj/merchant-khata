export type DaybookSaleRow = {
  total_amount: number;
  payment_type: string;
  cash_amount?: number | null;
  upi_amount?: number | null;
  credit_amount?: number | null;
};

export function aggregateDaybookSales(sales: DaybookSaleRow[]) {
  let cashSales = 0;
  let upiSales = 0;
  let creditSales = 0;

  for (const sale of sales) {
    const cashPart = Number(sale.cash_amount || 0);
    const upiPart = Number(sale.upi_amount || 0);
    const creditPart = Number(sale.credit_amount || 0);

    if (cashPart > 0 || upiPart > 0 || creditPart > 0) {
      cashSales += cashPart;
      upiSales += upiPart;
      creditSales += creditPart;
      continue;
    }

    const amt = Number(sale.total_amount);
    if (sale.payment_type === 'cash') cashSales += amt;
    else if (sale.payment_type === 'upi') upiSales += amt;
    else if (sale.payment_type === 'credit') creditSales += amt;
    else cashSales += amt;
  }

  return {
    cashSales,
    upiSales,
    creditSales,
    totalSales: cashSales + upiSales + creditSales,
  };
}
