import { type PaperSize, thermalPrintStyles } from '@/lib/printerSettings';

type ReceiptBusinessInfo = {
  name?: string;
  address?: string;
  phone?: string;
  owner_phone?: string;
  fssai_number?: string | null;
};

type ReceiptItem = {
  qty: number;
  unit_price: number;
  product: {
    name: string;
    gst_rate?: number;
    tax_inclusive?: boolean;
  };
  variant?: { name: string } | null;
  modifiers?: { name: string }[];
  notes?: string;
};

function calculateReceiptTax(items: ReceiptItem[]) {
  let taxableBase = 0;
  let totalGst = 0;
  const rateBreakdown: Record<number, { gst: number }> = {};

  for (const item of items) {
    const lineTotal = item.qty * item.unit_price;
    const rate = Number(item.product?.gst_rate) || 0;
    const inclusive = item.product?.tax_inclusive !== false;

    let base = lineTotal;
    let gst = 0;

    if (rate > 0) {
      if (inclusive) {
        base = lineTotal / (1 + rate / 100);
        gst = lineTotal - base;
      } else {
        base = lineTotal;
        gst = lineTotal * (rate / 100);
      }
    }

    taxableBase += base;
    totalGst += gst;

    if (rate > 0) {
      if (!rateBreakdown[rate]) {
        rateBreakdown[rate] = { gst: 0 };
      }
      rateBreakdown[rate].gst += gst;
    }
  }

  return { taxableBase, totalGst, rateBreakdown };
}

function buildTaxRows(rateBreakdown: Record<number, { gst: number }>): string {
  const rates = Object.keys(rateBreakdown)
    .map(Number)
    .filter((rate) => rate > 0)
    .sort((a, b) => a - b);

  if (rates.length === 0) {
    return '';
  }

  return rates
    .map((rate) => {
      const gst = rateBreakdown[rate].gst;
      const cgst = gst / 2;
      const sgst = gst / 2;
      const halfRate = (rate / 2).toFixed(1).replace(/\.0$/, '');
      return `
        <div class="tax-row">
          <span>CGST (${halfRate}%)</span>
          <span>₹${cgst.toFixed(2)}</span>
        </div>
        <div class="tax-row">
          <span>SGST (${halfRate}%)</span>
          <span>₹${sgst.toFixed(2)}</span>
        </div>
      `;
    })
    .join('');
}

export const generateReceiptHTML = (
  businessInfo: ReceiptBusinessInfo,
  order: { invoice_number?: number; type?: string },
  items: ReceiptItem[],
  totalAmount: number,
  tableName?: string,
  paperSize: PaperSize = '58mm',
) => {
  const billableItems = items.filter((item: ReceiptItem & { status?: string }) => item.status !== 'cancelled');
  const itemsForTax = billableItems.length > 0 ? billableItems : items;
  const { taxableBase, totalGst, rateBreakdown } = calculateReceiptTax(itemsForTax);

  const phone = businessInfo.phone || businessInfo.owner_phone;
  const fssaiText = businessInfo.fssai_number
    ? `<div class="text-center fssai">FSSAI: ${businessInfo.fssai_number}</div>`
    : '';
  const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const taxRowsHtml = buildTaxRows(rateBreakdown);

  const itemsHtml = itemsForTax
    .map((item) => {
      const qty = item.qty;
      const name = item.product.name + (item.variant ? ` (${item.variant.name})` : '');
      const total = qty * item.unit_price;

      let subItems = '';
      if (item.modifiers && item.modifiers.length > 0) {
        subItems = `<div class="item-sub"> + ${item.modifiers.map((m) => m.name).join(', ')}</div>`;
      }

      return `
      <tr>
        <td class="item-name">${name}${subItems}</td>
        <td class="item-qty">${qty}</td>
        <td class="item-total">₹${total.toFixed(2)}</td>
      </tr>
    `;
    })
    .join('');

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          ${thermalPrintStyles(paperSize)}
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .title { font-size: 16px; font-weight: bold; margin-bottom: 4px; text-transform: uppercase; }
          .subtitle { font-size: 12px; margin-bottom: 2px; }
          .fssai { font-size: 10px; margin-bottom: 8px; }
          
          .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
          
          .info-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px; }
          
          table { width: 100%; border-collapse: collapse; margin: 8px 0; }
          th { border-bottom: 1px solid #000; padding-bottom: 4px; font-size: 11px; text-align: left; }
          th.item-qty, th.item-total { text-align: right; }
          
          td { padding: 4px 0; vertical-align: top; }
          td.item-qty { text-align: right; width: 15%; }
          td.item-total { text-align: right; width: 25%; }
          
          .item-sub { font-size: 10px; color: #444; }
          
          .totals-row { display: flex; justify-content: space-between; font-size: 12px; margin: 2px 0; }
          .grand-total { font-size: 14px; font-weight: bold; margin: 4px 0; padding: 4px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
          
          .tax-row { display: flex; justify-content: space-between; font-size: 10px; color: #333; margin: 1px 0; }
          
          .footer { text-align: center; margin-top: 16px; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="text-center title">${businessInfo.name || 'Restaurant'}</div>
        <div class="text-center subtitle">${businessInfo.address || ''}</div>
        <div class="text-center subtitle">${phone ? `Ph: ${phone}` : ''}</div>
        ${fssaiText}
        
        <div class="divider"></div>
        
        <div class="info-row">
          <span>Bill No: ${order.invoice_number ? '#' + order.invoice_number : 'N/A'}</span>
          <span>Date: ${dateStr.split(',')[0]}</span>
        </div>
        <div class="info-row">
          <span>Type: ${order.type === 'dine_in' ? 'Dine In' : 'Takeaway'}</span>
          <span>Time: ${dateStr.split(',')[1]?.trim() || ''}</span>
        </div>
        ${tableName ? `
        <div class="info-row">
          <span class="bold">Table: ${tableName}</span>
        </div>
        ` : ''}
        
        <div class="divider"></div>
        
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th class="item-qty">Qty</th>
              <th class="item-total">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <div class="divider"></div>
        
        <div class="totals-row">
          <span>Subtotal</span>
          <span>₹${taxableBase.toFixed(2)}</span>
        </div>
        ${taxRowsHtml}
        ${totalGst <= 0 ? '' : `
        <div class="totals-row">
          <span>Total GST</span>
          <span>₹${totalGst.toFixed(2)}</span>
        </div>
        `}
        
        <div class="totals-row grand-total">
          <span>Total Amount</span>
          <span>₹${totalAmount.toFixed(2)}</span>
        </div>
        
        <div class="footer">
          <p>Thank you for visiting!</p>
          <p>Have a nice day!</p>
        </div>
      </body>
    </html>
  `;
};

export const generateKOTHTML = (
  order: { type?: string; kot_count?: number },
  items: ReceiptItem[],
  tableName?: string,
  paperSize: PaperSize = '58mm',
) => {
  const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const kotNumber = order.kot_count || 1;

  const itemsHtml = items
    .map((item) => {
      const qty = item.qty;
      const name = item.product.name + (item.variant ? ` (${item.variant.name})` : '');

      let subItems = '';
      if (item.modifiers && item.modifiers.length > 0) {
        subItems = `<div class="item-sub"> + ${item.modifiers.map((m) => m.name).join(', ')}</div>`;
      }

      let notesHtml = '';
      if (item.notes) {
        notesHtml = `<div class="item-notes">Note: ${item.notes}</div>`;
      }

      return `
      <tr>
        <td class="item-qty">${qty} x</td>
        <td class="item-name">
          <span class="bold">${name}</span>
          ${subItems}
          ${notesHtml}
        </td>
      </tr>
      <tr><td colspan="2"><div class="divider"></div></td></tr>
    `;
    })
    .join('');

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          ${thermalPrintStyles(paperSize)}
          .text-center { text-align: center; }
          .bold { font-weight: bold; }
          .title { font-size: 18px; font-weight: bold; margin-bottom: 4px; border: 1px solid #000; padding: 4px; display: inline-block; }
          
          .divider { border-bottom: 1px dashed #000; margin: 4px 0; }
          .thick-divider { border-bottom: 2px solid #000; margin: 8px 0; }
          
          .info-row { font-size: 12px; margin-bottom: 2px; }
          
          table { width: 100%; border-collapse: collapse; margin: 8px 0; }
          td { padding: 4px 0; vertical-align: top; }
          td.item-qty { width: 15%; font-weight: bold; font-size: 16px; }
          
          .item-sub { font-size: 12px; color: #444; margin-top: 2px; }
          .item-notes { font-size: 12px; font-style: italic; border: 1px dashed #666; padding: 2px 4px; margin-top: 4px; display: inline-block; }
        </style>
      </head>
      <body>
        <div class="text-center">
          <div class="title">KOT #${kotNumber}</div>
        </div>
        
        <div class="thick-divider"></div>
        
        <div class="info-row">
          <span class="bold">Type: ${order.type === 'dine_in' ? 'Dine In' : 'Takeaway'}</span>
        </div>
        ${tableName ? `
        <div class="info-row">
          <span class="bold" style="font-size:16px;">Table: ${tableName}</span>
        </div>
        ` : ''}
        <div class="info-row">
          <span>Time: ${dateStr.split(',')[1]?.trim() || ''}</span>
        </div>
        
        <div class="thick-divider"></div>
        
        <table>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <div class="text-center" style="font-size: 10px; margin-top: 10px;">
          -- END OF KOT --
        </div>
      </body>
    </html>
  `;
};
