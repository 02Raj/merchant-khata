# Merchant Desk - Master Test Strategy

This document outlines the complete testing strategy for the Merchant Desk application. It serves as a master checklist for all business types. We will execute these tests in phases (bunches) as we build and refine features. 

As features are tested and verified, check them off using `[x]`.

---

## 1. Retail Store (General Store / Kirana)
Retail is focused on fast billing, barcode scanning, and simple inventory management.

### Products & Inventory
- `[ ]` **Add Product:** Verify adding a product with base units (Pcs, Kg, Ltr).
- `[ ]` **Scan to Add:** Verify Open Food Facts API integration auto-fills details.
- `[ ]` **Stock In:** Verify adding stock manually updates inventory correctly.
- `[ ]` **Low Stock Alert:** Verify items hit the low stock threshold and appear in the "Low Stock" tab.
- `[ ]` **WhatsApp Order:** Verify WhatsApp deep-linking works for ordering low stock.

### Sales & Billing
- `[ ]` **Cart Calculation:** Verify Subtotal = Price * Quantity.
- `[ ]` **Decimals / Loose Items:** Verify typing `0.25` for quantities calculates correct price and deducts exact `0.25` from stock.
- `[ ]` **Tax (Inclusive):** Verify base price is back-calculated correctly from MRP.
- `[ ]` **Tax (Exclusive):** Verify GST % is correctly added to the base price.
- `[ ]` **Receipt Generation:** Verify thermal print and PDF generation contains correct items and totals.

---

## 2. Wholesale (Distributors / B2B)
Wholesale focuses on bulk selling, alternate units, minimum order quantities (MOQ), and ledger (Udhaar).

### Products & Alternate Units
- `[ ]` **Alternate Units Configuration:** Verify configuring 1 Box = 10 Pcs.
- `[ ]` **Wholesale Pricing:** Verify assigning a separate wholesale price.
- `[ ]` **MOQ Validation:** Verify app flags or warns if wholesale quantity is below MOQ.

### Sales & Ledger
- `[ ]` **Bulk Sales Deduction:** Verify selling 2 Boxes deducts exactly 20 Pcs from inventory.
- `[ ]` **Credit (Udhaar) Sales:** Verify checking out via "Credit" requires a linked customer.
- `[ ]` **Customer Ledger:** Verify Credit sale amount is correctly added to the Customer's Ledger Balance.
- `[ ]` **Wholesale Receipt:** Verify the PDF receipt includes "Account Ledger Summary" (Previous Balance + This Bill = Total Due).

---

## 3. Hybrid (Retail + Wholesale)
Stores that sell loose to regular customers but boxes to smaller shopkeepers.

### Hybrid Operations
- `[ ]` **Customer Type Sync:** Verify selecting a Wholesale customer automatically shifts the Cart Pricing Mode to "Wholesale".
- `[ ]` **Manual Mode Toggle:** Verify the cashier can manually toggle between Retail and Wholesale pricing in the cart screen.
- `[ ]` **Mixed Cart Validation:** Verify the cart calculates correctly if one item uses Retail rate and another uses Wholesale rate.

---

## 4. Restaurant POS (F&B)
Restaurants have unique workflows like table management, KOTs (Kitchen Order Tickets), and recipe-based inventory (Raw Materials).

### Operations
- `[ ]` **Table Layout:** Verify table creation, mapping, and status (Occupied vs Empty).
- `[ ]` **KOT Generation:** Verify placing an order sends a KOT to the Kitchen Printer without checking out the final bill.
- `[ ]` **Split Billing:** Verify ability to split bill by items or percentage.
- `[ ]` **Dining Modes:** Verify toggling between Dine-in, Takeaway, and Delivery.

### Recipe & Inventory
- `[ ]` **Raw Material Setup:** Verify adding raw materials (e.g., Sugar, Milk, Coffee Beans).
- `[ ]` **Recipe Mapping:** Verify mapping a menu item (e.g., Latte) to consume 15g Coffee Beans and 200ml Milk.
- `[ ]` **Auto Deduction:** Verify selling 1 Latte automatically deducts 15g Coffee Beans and 200ml Milk from the raw material inventory.

---

## Ongoing Stability & Security
These are global tests applied to the entire application.

- `[ ]` **Offline Resilience:** Verify the app handles network drops without crashing (using React Query cache).
- `[ ]` **Row Level Security (RLS):** Verify Business A cannot access or see Business B's products, customers, or ledger.
- `[ ]` **Input Validation:** Verify negative numbers or invalid texts in pricing/stock fields throw friendly errors instead of crashing.
