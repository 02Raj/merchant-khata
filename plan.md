# Merchant Desk — Development Roadmap & Execution Plan

> Last updated: Aug 2026 · Tracks every feature from MVP to AI-powered business intelligence.

---

## Phase 0: Foundation ✅ COMPLETE

**Duration**: Week 1–2 (Aug 2026)

| # | Task | Status | Notes |
|---|---|---|---|
| 0.1 | Expo + TypeScript project scaffold | ✅ | SDK 54, expo-router v6 |
| 0.2 | Supabase project setup | ✅ | PostgreSQL + PostgREST |
| 0.3 | Firebase project setup (Phone Auth) | ✅ | Separate from TutorPe/AutoBids projects |
| 0.4 | Environment variables (.env + .env.example) | ✅ | 9 vars, git-ignored |
| 0.5 | Database schema (13 tables, 6 enums) | ✅ | `20260813120000_enums_and_tables.sql` |
| 0.6 | RLS policies (50+ policies) | ✅ | `20260813120002_rls_and_policies.sql` |
| 0.7 | Cross-tenant safety triggers (7 triggers) | ✅ | Defense-in-depth on all parent-child FKs |
| 0.8 | Firebase → Supabase auth bridge | ✅ | `accessToken` callback in Supabase client |
| 0.9 | Design system (`lib/theme.ts`) | ✅ | Dark earthy palette, 12 color tokens |

---

## Phase 1: Core MVP 🔄 IN PROGRESS

**Duration**: Week 2–5 (Aug–Sep 2026)
**Goal**: A working app that a merchant can use for daily billing, product management, and customer credit tracking.

### 1.1 Authentication & Onboarding ✅ COMPLETE

| # | Task | Status | Details |
|---|---|---|---|
| 1.1.1 | Login screen (phone + reCAPTCHA) | ✅ | `app/(auth)/login.tsx` |
| 1.1.2 | OTP verification screen | ✅ | `app/(auth)/otp.tsx` |
| 1.1.3 | Business setup form | ✅ | Name, address, type, GSTIN → Supabase insert |
| 1.1.4 | Auth guard (auto-redirect logic) | ✅ | `app/_layout.tsx` RootNavigator |
| 1.1.5 | AuthContext (global state) | ✅ | Firebase user + business membership check |

### 1.2 Dashboard ✅ SHELL COMPLETE

| # | Task | Status | Details |
|---|---|---|---|
| 1.2.1 | Bottom tab navigator (Ionicons) | ✅ | 5 tabs with dark theme styling |
| 1.2.2 | Metrics cards UI | ✅ | Today's Sales, Receivables, Low Stock |
| 1.2.3 | Quick action buttons | ✅ | New Sale, Add Product, Payment In |
| 1.2.4 | Recent activity list | ✅ | Placeholder entries |
| 1.2.5 | Connect dashboard to real data | ⬜ | Blocked by: Sales + Customers must exist first |

### 1.3 Product Catalog ✅ COMPLETE

| # | Task | Status | Details |
|---|---|---|---|
| 1.3.1 | Product list (dynamic from Supabase) | ✅ | FlatList with pull-to-refresh |
| 1.3.2 | Stock status derivation | ✅ | Sum of `inventory_transactions.quantity_change` |
| 1.3.3 | Search/filter by name | ✅ | Client-side filter on fetched list |
| 1.3.4 | Empty state (genuine) | ✅ | "Add your first product" CTA |
| 1.3.5 | Add Product modal | ✅ | Name, category, unit, prices |
| 1.3.6 | Dynamic wholesale fields | ✅ | Conditional on `business_type` from DB |
| 1.3.7 | Edit Product (tap to edit) | ✅ | Pre-filled form, Supabase update |
| 1.3.8 | Form validation | ✅ | Required fields + numeric checks |

### 1.4 Sales / Billing ⬜ NEXT PRIORITY

| # | Task | Status | Details |
|---|---|---|---|
| 1.4.1 | New Sale flow | ⬜ | Select customer → add products → set payment type |
| 1.4.2 | Product picker (from existing catalog) | ⬜ | Search + select with quantity input |
| 1.4.3 | Cart/line items management | ⬜ | Add/remove items, auto-calculate subtotals |
| 1.4.4 | Payment type selection | ⬜ | Cash / UPI / Credit (udhaar) / Partial |
| 1.4.5 | Bill generation + Supabase insert | ⬜ | Insert `sales` + `sale_items` + `inventory_transactions` |
| 1.4.6 | Auto-create ledger entry for credit sales | ⬜ | Insert `ledger_transactions` when payment_type = credit |
| 1.4.7 | Sale history list | ⬜ | View past sales with details |
| 1.4.8 | Wholesale price auto-selection | ⬜ | Use wholesale_price when customer_type = wholesale |

### 1.5 Customer Management ⬜ UPCOMING

| # | Task | Status | Details |
|---|---|---|---|
| 1.5.1 | Customer list (dynamic) | ⬜ | Name, phone, type, balance |
| 1.5.2 | Add/Edit customer | ⬜ | Name, phone, address, type, credit limit |
| 1.5.3 | Customer detail view | ⬜ | Purchase history + running balance |
| 1.5.4 | Udhaar / Credit tracking | ⬜ | Running balance from `ledger_transactions` |
| 1.5.5 | Record payment received | ⬜ | Insert `payments` + `ledger_transactions` |
| 1.5.6 | Credit limit enforcement | ⬜ | Warn/block when limit exceeded |

### 1.6 Purchases / Stock-In ⬜ UPCOMING

| # | Task | Status | Details |
|---|---|---|---|
| 1.6.1 | Supplier list (CRUD) | ⬜ | Name, phone, address |
| 1.6.2 | New purchase entry | ⬜ | Select supplier → add products → quantities |
| 1.6.3 | Auto-create inventory transactions | ⬜ | Increase stock on purchase |
| 1.6.4 | Opening stock entry | ⬜ | Bulk add initial inventory for new shops |

### 1.7 Dashboard Data Connection ⬜ BLOCKED

| # | Task | Status | Blocked By |
|---|---|---|---|
| 1.7.1 | Today's Sales (real) | ⬜ | 1.4 (Sales must exist) |
| 1.7.2 | Pending Receivables (real) | ⬜ | 1.5 (Customer credit must exist) |
| 1.7.3 | Low Stock count (real) | ⬜ | 1.6 (Stock-in must exist) |
| 1.7.4 | Recent Activity feed (real) | ⬜ | 1.4 + 1.5 |

---

## Phase 2: Polish & Smart Features (Oct–Nov 2026)

**Goal**: Make the app delightful and start adding AI-assisted intelligence.

### 2.1 UX Polish

| # | Task | Details |
|---|---|---|
| 2.1.1 | Loading skeletons | Shimmer placeholders instead of spinners |
| 2.1.2 | Haptic feedback | Subtle vibration on button presses |
| 2.1.3 | Swipe-to-delete on lists | Products, customers, suppliers |
| 2.1.4 | Pull-to-refresh everywhere | Already on Products; extend to all lists |
| 2.1.5 | Bill PDF/image generation | Shareable via WhatsApp |
| 2.1.6 | Dark mode refinements | Test on various AMOLED screens |

### 2.2 AI: Smart Inventory

| # | Feature | How It Works |
|---|---|---|
| 2.2.1 | **Demand Forecasting** | Analyze `sale_items` time-series → predict next week's demand per product |
| 2.2.2 | **Reorder Alerts** | Compare sales velocity with current stock → push notification when reorder needed |
| 2.2.3 | **Dynamic Pricing** | Analyze purchase cost trends + competitor pricing → suggest optimal sale/wholesale price |
| 2.2.4 | **Stock Health Score** | Per-product score (0–100) based on turnover rate, days-of-stock, and demand trend |

### 2.3 Spring Boot API Layer

| # | Task | Details |
|---|---|---|
| 2.3.1 | API server scaffold | Spring Boot + PostgreSQL connection |
| 2.3.2 | Migrate high-traffic queries | Dashboard aggregations, reports |
| 2.3.3 | AI model hosting | Python microservice behind Spring Boot |
| 2.3.4 | Client SDK update | Swap Supabase direct calls → REST API calls |

---

## Phase 3: Customer Intelligence & Analytics (Dec 2026 – Feb 2027)

**Goal**: Help merchants understand their customers and optimize credit decisions.

### 3.1 AI: Customer Intelligence

| # | Feature | How It Works |
|---|---|---|
| 3.1.1 | **Credit Risk Scoring** | ML model trained on `ledger_transactions` + `payments` → score per customer |
| 3.1.2 | **Customer Segmentation** | Cluster analysis on purchase frequency, amount, payment behavior |
| 3.1.3 | **Payment Reminder Optimization** | AI picks best time + channel for reminders based on past response |
| 3.1.4 | **Churn Prediction** | Flag customers who haven't purchased in N days (learned threshold) |

### 3.2 Reports & Analytics

| # | Feature | Details |
|---|---|---|
| 3.2.1 | Daily/weekly/monthly sales reports | Charts + exportable data |
| 3.2.2 | Product-wise profitability | Revenue - cost per product |
| 3.2.3 | Customer-wise revenue ranking | Top buyers, credit-heavy customers |
| 3.2.4 | GST-ready export | For shops with GSTIN |

---

## Phase 4: Scale & Marketplace (Mar 2027+)

**Goal**: Multi-shop support, marketplace discovery, and advanced AI.

### 4.1 Multi-Shop & Staff

| # | Feature | Details |
|---|---|---|
| 4.1.1 | Staff invite flow | Owner sends invite → staff joins via OTP |
| 4.1.2 | Role-based permissions | Staff can bill but can't delete products |
| 4.1.3 | Multi-shop switching | One user, multiple businesses |

### 4.2 AI: Business Intelligence

| # | Feature | How It Works |
|---|---|---|
| 4.2.1 | **Natural Language Reports** | "Show me top products this month" → LLM query → instant answer |
| 4.2.2 | **Anomaly Detection** | Real-time alerts when sales/cash deviate from learned patterns |
| 4.2.3 | **Cash Flow Forecasting** | Predict cash position for next 7/30 days |
| 4.2.4 | **Supplier Optimization** | Rank suppliers by price, reliability, lead time |

### 4.3 Offline-First (If Pilot Validates Need)

| # | Task | Details |
|---|---|---|
| 4.3.1 | Local SQLite database | Mirror critical tables locally |
| 4.3.2 | Sync engine | Conflict resolution for offline edits |
| 4.3.3 | Queue offline sales | Auto-sync when connectivity returns |

### 4.4 Marketplace (Phase 3 per Original Roadmap)

| # | Feature | Details |
|---|---|---|
| 4.4.1 | Shop discovery | Customers can find nearby wholesale shops |
| 4.4.2 | Digital catalog sharing | WhatsApp-shareable product list |
| 4.4.3 | Online ordering | Wholesale buyers place orders through the app |

---

## Dependency Graph

```
Phase 0 (Foundation)
    │
    ▼
Phase 1.1 (Auth) ──▶ Phase 1.2 (Dashboard Shell)
    │                        │
    ▼                        │
Phase 1.3 (Products) ◀──────┘
    │
    ▼
Phase 1.4 (Sales/Billing)
    │
    ├──▶ Phase 1.5 (Customers/Udhaar)
    │         │
    │         ▼
    │    Phase 1.6 (Purchases/Stock-In)
    │         │
    ▼         ▼
Phase 1.7 (Dashboard Data Connection)
    │
    ▼
Phase 2 (Polish + AI Inventory + Spring Boot)
    │
    ▼
Phase 3 (AI Customer Intelligence + Reports)
    │
    ▼
Phase 4 (Scale + Marketplace + Offline)
```

---

## Success Metrics (Pilot)

| Metric | Target | How Measured |
|---|---|---|
| Daily active merchants | 5+ of 10 pilot shops | Supabase auth logs |
| Bills created per day per shop | 10+ | `sales` table count |
| Time to create a bill | < 30 seconds | In-person observation |
| Credit tracking adoption | 80% of credit sales logged | `ledger_transactions` vs. reported |
| Data accuracy | Merchant confirms numbers match reality | Weekly check-in during pilot |

---

*This plan is a living document. Update it as pilot feedback shapes priorities.*
