import { describe, expect, it } from '@jest/globals';

import { aggregateDaybookSales } from '@/lib/daybookCalc';

describe('aggregateDaybookSales', () => {
  it('handles empty list', () => {
    expect(aggregateDaybookSales([])).toEqual({
      cashSales: 0,
      upiSales: 0,
      creditSales: 0,
      totalSales: 0,
    });
  });

  it('prefers explicit split columns over payment_type', () => {
    const agg = aggregateDaybookSales([
      {
        total_amount: 1000,
        payment_type: 'cash',
        cash_amount: 100,
        upi_amount: 200,
        credit_amount: 700,
      },
    ]);
    expect(agg).toEqual({
      cashSales: 100,
      upiSales: 200,
      creditSales: 700,
      totalSales: 1000,
    });
  });
});
