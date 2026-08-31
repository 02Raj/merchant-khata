import { formatSaleBillNumber, type PaperSize } from '@/lib/printerSettings';
import { formatPaymentModeLabel, type PaymentSplit } from '@/lib/salesCheckout';
import { normalizeCustomerType, walkInCustomerLabel } from '@/lib/wholesaleHelpers';

export type RetailReceiptLine = {
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  tax_rate?: number;
  tax_amount?: number;
  tax_inclusive?: boolean;
  product?: {
    name: string;
    hsn_code?: string | null;
    alternate_unit?: string | null;
    conversion_factor?: number | null;
  };
  is_wholesale_rate?: boolean;
  displayQty?: string | number;
};

export type RetailReceiptSnapshot = {
  saleId: string;
  date: string;
  customer?: { name: string; customer_type?: string; balance?: number } | null;
  paymentType: string;
  paymentSplit?: PaymentSplit;
  discountAmount?: number;
  totals: {
    grandTotal: number;
    taxTotal: number;
    itemsForRpc: RetailReceiptLine[];
  };
  cart?: Array<{
    product: { id: string; name: string; hsn_code?: string | null; alternate_unit?: string | null; conversion_factor?: number | null };
    quantity: number | string;
    unit_price: number;
    is_wholesale_rate?: boolean;
    selected_unit?: 'base' | 'alternate';
  }>;
};

type BusinessHeader = {
  name?: string;
  gstin?: string | null;
  businessType?: string;
};

export function snapshotHasWholesaleLines(snapshot: RetailReceiptSnapshot): boolean {
  if (snapshot.cart?.some((line) => line.is_wholesale_rate)) return true;
  return snapshot.totals.itemsForRpc.some((line) => line.is_wholesale_rate);
}

export function isWholesaleInvoice(snapshot: RetailReceiptSnapshot): boolean {
  const isWholesaleCustomer = snapshot.customer
    ? normalizeCustomerType(snapshot.customer.customer_type) === 'wholesale'
    : false;
  return isWholesaleCustomer || snapshotHasWholesaleLines(snapshot);
}

export function buildRetailPdfHtml(snapshot: RetailReceiptSnapshot, business: BusinessHeader): string {
  const wholesaleInvoice = isWholesaleInvoice(snapshot);
  const walkInLabel = walkInCustomerLabel(business.businessType);
  const creditPortion = snapshot.paymentSplit?.credit ?? (snapshot.paymentType === 'credit' ? snapshot.totals.grandTotal : 0);
  const showLedgerSummary = creditPortion > 0 && snapshot.customer;
  const previousBalance = snapshot.customer?.balance || 0;
  const currentBillAmount = creditPortion;
  const totalOutstanding = previousBalance + currentBillAmount;
  const gstinLine = business.gstin ? `<p class="subtitle">GSTIN: ${business.gstin}</p>` : '';
  const discount = snapshot.discountAmount ?? 0;
  const paymentLabel = snapshot.paymentSplit
    ? formatPaymentModeLabel(snapshot.paymentSplit)
    : snapshot.paymentType.toUpperCase();

  return `
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: bold; margin: 0; }
          .subtitle { font-size: 14px; color: #666; margin-top: 5px; }
          .customer { margin-bottom: 20px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f8f8f8; font-weight: bold; }
          .total-row { font-weight: bold; font-size: 16px; }
          .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #888; }
          .wholesale-badge { font-size: 10px; color: #c45c26; margin-left: 5px; border: 1px solid #c45c26; padding: 2px 4px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="header">
          <p class="title">${business.name || 'Retail Invoice'}</p>
          <p class="subtitle">${wholesaleInvoice ? 'Wholesale Tax Invoice' : 'Tax Invoice'}</p>
          ${gstinLine}
        </div>
        <div class="customer">
          <strong>Bill No:</strong> ${formatSaleBillNumber(snapshot.saleId)}<br/>
          <strong>Customer:</strong> ${snapshot.customer ? snapshot.customer.name : walkInLabel}<br/>
          <strong>Date:</strong> ${snapshot.date}<br/>
          <strong>Payment Mode:</strong> ${paymentLabel}
        </div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Rate</th>
              <th style="text-align: right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${renderReceiptRows(snapshot)}
          </tbody>
        </table>
        <div style="text-align: right; margin-top: 20px;">
          <p>Subtotal: ₹${(snapshot.totals.grandTotal - snapshot.totals.taxTotal + discount).toFixed(2)}</p>
          <p>GST Amount: ₹${snapshot.totals.taxTotal.toFixed(2)}</p>
          ${discount > 0 ? `<p>Discount: -₹${discount.toFixed(2)}</p>` : ''}
          <p class="total-row">Grand Total: ₹${snapshot.totals.grandTotal.toFixed(2)}</p>
        </div>
        ${showLedgerSummary ? `
          <div style="margin-top: 30px; padding: 15px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h3 style="margin-top: 0; color: #111827;">Account Ledger Summary</h3>
            <table style="margin-bottom: 0;">
              <tr><td>Previous Balance (Udhaar):</td><td style="text-align: right">₹${previousBalance.toFixed(2)}</td></tr>
              <tr><td>Udhaar on this bill:</td><td style="text-align: right">₹${currentBillAmount.toFixed(2)}</td></tr>
              <tr class="total-row"><td><strong>Total Payable Balance:</strong></td><td style="text-align: right"><strong>₹${totalOutstanding.toFixed(2)}</strong></td></tr>
            </table>
          </div>
        ` : ''}
        <div class="footer">
          <p>Thank you for shopping with us!</p>
          <p>Generated by OmniBill</p>
        </div>
      </body>
    </html>
  `;
}

export function buildRetailThermalHtml(
  snapshot: RetailReceiptSnapshot,
  business: BusinessHeader,
  paperSize: PaperSize,
): string {
  const pxWidth = paperSize === '58mm' ? 210 : 300;
  const wholesaleInvoice = isWholesaleInvoice(snapshot);
  const walkInLabel = walkInCustomerLabel(business.businessType);
  const creditPortion = snapshot.paymentSplit?.credit ?? (snapshot.paymentType === 'credit' ? snapshot.totals.grandTotal : 0);
  const showLedgerSummary = creditPortion > 0 && snapshot.customer;
  const previousBalance = snapshot.customer?.balance || 0;
  const totalOutstanding = previousBalance + creditPortion;
  const gstinLine = business.gstin ? `GSTIN: ${business.gstin}<br>` : '';
  const discount = snapshot.discountAmount ?? 0;
  const paymentLabel = snapshot.paymentSplit
    ? formatPaymentModeLabel(snapshot.paymentSplit)
    : snapshot.paymentType.toUpperCase();

  return `
    <html lang="en">
    <head>
      <style>
        @page { margin: 0; size: ${paperSize} auto; }
        body { font-family: monospace; margin: 0; padding: 10px; width: ${pxWidth}px; color: #000; font-size: 14px; line-height: 1.2; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .title { font-size: 20px; font-weight: bold; margin-bottom: 5px; text-transform: uppercase; }
        .divider { border-top: 1px dashed #000; margin: 8px 0; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; padding: 2px 0; vertical-align: top; }
        th { border-bottom: 1px dashed #000; padding-bottom: 4px; }
        .right { text-align: right; }
        .item-name { max-width: 150px; word-wrap: break-word; }
      </style>
    </head>
    <body>
      <div class="center title">${business.name || 'Retail Store'}</div>
      <div class="center">${wholesaleInvoice ? 'WHOLESALE INVOICE' : 'TAX INVOICE'}</div>
      <div class="center" style="font-size:11px">${gstinLine}</div>
      <div class="divider"></div>
      <div>
        Bill No: ${formatSaleBillNumber(snapshot.saleId)}<br>
        Date: ${snapshot.date}<br>
        Customer: ${snapshot.customer ? snapshot.customer.name : walkInLabel}<br>
        Mode: ${paymentLabel}
      </div>
      <div class="divider"></div>
      <table>
        <thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Amt</th></tr></thead>
        <tbody>${renderThermalRows(snapshot)}</tbody>
      </table>
      <div class="divider"></div>
      <table>
        <tr><td>Subtotal</td><td class="right">${(snapshot.totals.grandTotal - snapshot.totals.taxTotal + discount).toFixed(2)}</td></tr>
        <tr><td>GST</td><td class="right">${snapshot.totals.taxTotal.toFixed(2)}</td></tr>
        ${discount > 0 ? `<tr><td>Discount</td><td class="right">-${discount.toFixed(2)}</td></tr>` : ''}
        <tr><td class="bold">Grand Total</td><td class="right bold">${snapshot.totals.grandTotal.toFixed(2)}</td></tr>
      </table>
      ${showLedgerSummary ? `
        <div class="divider"></div>
        <div class="center bold">ACCOUNT SUMMARY</div>
        <table>
          <tr><td>Prev Udhaar:</td><td class="right">₹${previousBalance.toFixed(2)}</td></tr>
          <tr><td>This Bill Udhaar:</td><td class="right">₹${creditPortion.toFixed(2)}</td></tr>
          <tr><td class="bold">Total Due:</td><td class="right bold">₹${totalOutstanding.toFixed(2)}</td></tr>
        </table>
      ` : ''}
      <div class="divider"></div>
      <div class="center">Thank you for shopping!</div>
      <div class="center" style="font-size:10px; margin-top:8px;">Generated by OmniBill</div>
    </body>
    </html>
  `;
}

function renderReceiptRows(snapshot: RetailReceiptSnapshot): string {
  return snapshot.totals.itemsForRpc.map((item) => {
    const cartItem = snapshot.cart?.find((c) => c.product.id === item.product_id);
    const prod = cartItem?.product ?? item.product;
    const isWholesaleRate = cartItem?.is_wholesale_rate ?? item.is_wholesale_rate;
    const displayQty = item.displayQty ?? item.quantity;
    const displayRate = cartItem?.selected_unit === 'alternate' && prod?.conversion_factor
      ? item.unit_price * prod.conversion_factor
      : item.unit_price;

    return `
      <tr>
        <td>
          ${prod?.name || 'Item'}
          ${prod?.hsn_code ? `<br/><span style="font-size:10px;color:#666">HSN: ${prod.hsn_code}</span>` : ''}
          ${isWholesaleRate ? '<span class="wholesale-badge">WS Rate</span>' : ''}
        </td>
        <td>${displayQty}</td>
        <td>₹${Number(displayRate).toFixed(2)}</td>
        <td style="text-align: right">₹${(item.unit_price * item.quantity).toFixed(2)}</td>
      </tr>
    `;
  }).join('');
}

function renderThermalRows(snapshot: RetailReceiptSnapshot): string {
  return snapshot.totals.itemsForRpc.map((item) => {
    const cartItem = snapshot.cart?.find((c) => c.product.id === item.product_id);
    const prod = cartItem?.product ?? item.product;
    const isWholesaleRate = cartItem?.is_wholesale_rate ?? item.is_wholesale_rate;
    const displayQty = item.displayQty ?? item.quantity;
    const name = prod?.name?.substring(0, 18) || 'Item';

    return `
      <tr>
        <td class="item-name">${name}${isWholesaleRate ? '*' : ''}</td>
        <td class="right">${displayQty}</td>
        <td class="right">${(item.unit_price * item.quantity).toFixed(2)}</td>
      </tr>
    `;
  }).join('');
}
