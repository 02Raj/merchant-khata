export const generateReceiptHTML = (
  businessInfo: any,
  order: any,
  items: any[],
  totalAmount: number,
  tableName?: string
) => {
  const fssaiText = businessInfo.fssai_number ? `<div class="text-center fssai">FSSAI: ${businessInfo.fssai_number}</div>` : '';
  const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // Calculate taxes (assuming 5% GST total for restaurants, 2.5% CGST, 2.5% SGST on taxable amount)
  // For MVP, we simply show it mathematically if tax_inclusive was not strictly enforced, but let's do a simple split.
  // Assuming totalAmount is inclusive of 5% GST.
  // Base Amount = Total / 1.05
  // GST = Total - Base Amount
  const baseAmount = totalAmount / 1.05;
  const totalGst = totalAmount - baseAmount;
  const cgst = totalGst / 2;
  const sgst = totalGst / 2;

  let itemsHtml = items.map((item: any) => {
    const qty = item.qty;
    const name = item.product.name + (item.variant ? ` (${item.variant.name})` : '');
    const price = item.unit_price;
    const total = qty * price;
    
    let subItems = '';
    if (item.modifiers && item.modifiers.length > 0) {
      subItems = `<div class="item-sub"> + ${item.modifiers.map((m:any) => m.name).join(', ')}</div>`;
    }

    return `
      <tr>
        <td class="item-name">${name}${subItems}</td>
        <td class="item-qty">${qty}</td>
        <td class="item-total">₹${total.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          @page { margin: 0; size: 58mm 200mm; } /* Default 58mm thermal roll */
          body { 
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            margin: 0; 
            padding: 10px; 
            color: #000;
            font-size: 12px;
            line-height: 1.2;
          }
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
        <div class="text-center subtitle">${businessInfo.address || 'India'}</div>
        <div class="text-center subtitle">${businessInfo.phone ? 'Ph: ' + businessInfo.phone : ''}</div>
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
          <span>₹${baseAmount.toFixed(2)}</span>
        </div>
        <div class="tax-row">
          <span>CGST (2.5%)</span>
          <span>₹${cgst.toFixed(2)}</span>
        </div>
        <div class="tax-row">
          <span>SGST (2.5%)</span>
          <span>₹${sgst.toFixed(2)}</span>
        </div>
        
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
  order: any,
  items: any[],
  tableName?: string
) => {
  const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const kotNumber = order.kot_count || 1;

  let itemsHtml = items.map((item: any) => {
    const qty = item.qty;
    const name = item.product.name + (item.variant ? ` (${item.variant.name})` : '');
    
    let subItems = '';
    if (item.modifiers && item.modifiers.length > 0) {
      subItems = `<div class="item-sub"> + ${item.modifiers.map((m:any) => m.name).join(', ')}</div>`;
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
  }).join('');

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          @page { margin: 0; size: 58mm auto; } 
          body { 
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            margin: 0; 
            padding: 10px; 
            color: #000;
            font-size: 14px;
            line-height: 1.3;
          }
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
