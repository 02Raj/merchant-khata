# Merchant Desk

> **Mobile-first SaaS for wholesale + retail merchants in India.**
> Replaces manual khata (ledger) books and disconnected billing with a single mobile app covering billing, customer credit tracking (udhaar), and inventory management.

![Status](https://img.shields.io/badge/status-MVP%20v1.1%20(Active%20Development)-orange)
![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS-blue)
![Stack](https://img.shields.io/badge/stack-Expo%20%7C%20Supabase%20%7C%20Firebase-green)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Architecture Deep-Dive](#4-architecture-deep-dive)
5. [Authentication Bridge (Firebase → Supabase)](#5-authentication-bridge-firebase--supabase)
6. [Data Model (13 Core Tables)](#6-data-model-13-core-tables)
7. [Table Relationships (ER Diagram)](#7-table-relationships-er-diagram)
8. [Row Level Security (RLS)](#8-row-level-security-rls)
9. [Business Type Handling (Hybrid)](#9-business-type-handling-hybrid)
10. [Screen-by-Screen Breakdown](#10-screen-by-screen-breakdown)
11. [Design System](#11-design-system)
12. [AI-Powered Features Roadmap](#12-ai-powered-features-roadmap)
13. [Getting Started (Developer Setup)](#13-getting-started-developer-setup)
14. [Environment Variables](#14-environment-variables)
15. [Database Migrations](#15-database-migrations)
16. [Pilot Plan](#16-pilot-plan)
17. [Known Risks & Mitigations](#17-known-risks--mitigations)
18. [Contributing](#18-contributing)
19. [License](#19-license)

---

## 1. Overview

Merchant Desk is purpose-built for the Sahebganj pilot region, where merchants (primarily wholesale distributors of grains, spices, dry fruit, jaggery) still run their daily counter workflow on paper ledgers.

**The core pain points we solve:**

| Pain Point | How Merchant Desk Solves It |
|---|---|
| Paper khata gets lost, torn, or miscounted | Digital customer credit ledger with automatic running balance |
| No visibility into daily sales totals | Real-time dashboard showing today's sales, udhaar given, and stock levels |
| Manual inventory counting leads to stockouts | Inventory transactions are auto-generated from every sale and purchase |
| Billing is slow at the counter | Quick-select product → quantity → payment type flow optimized for speed |
| Wholesale and retail pricing confusion | Business type drives automatic field visibility — no mode switching needed |

**Current Status (Aug 2026):**
- ✅ Authentication (Firebase OTP → Supabase session bridge)
- ✅ Business Onboarding (register shop with type/address/GSTIN)
- ✅ Dashboard Shell (metrics cards, quick actions, recent activity)
- ✅ Products Screen (fully dynamic CRUD, stock derivation, wholesale-aware)
- 🔄 Sales / Billing (next priority)
- 🔄 Customer Credit / Udhaar Tracking
- 🔄 Purchases / Stock-In

---

## 2. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Mobile App** | React Native (Expo SDK 54) + TypeScript | Cross-platform, hot-reload, Expo Go for pilot distribution |
| **Routing** | expo-router v6 (file-based) | Intuitive nested layouts: `(auth)` group, `(tabs)` group |
| **Backend / DB** | Supabase (PostgreSQL 15, Auth, Storage) | Direct client access with RLS; zero backend code for MVP |
| **Auth SMS** | Firebase Phone Auth (free tier) | Free OTP delivery; bridged to Supabase identity |
| **State Management** | React Context + local state | Lightweight for MVP; Zustand/Jotai candidate for post-MVP |
| **Icons** | `@expo/vector-icons` (Ionicons) | Bundled with Expo, no extra install |
| **Styling** | React Native `StyleSheet` + centralized theme | Single source of truth in `lib/theme.ts` |

### Why not [X]?

- **No Redux/Zustand yet**: Overkill for 5 screens with simple data flow. Context handles auth state; screen-level state handles CRUD.
- **No Offline-first (yet)**: Deferred to post-pilot. Connectivity in tier-3 towns is a known risk being measured during pilot.
- **No Spring Boot API (yet)**: Supabase direct access with RLS is sufficient for MVP. The architecture is designed so a Spring Boot API can be inserted between client and database without rewriting screens.

---

## 3. Project Structure

```
merchant-desk-app/
├── app/                          # expo-router file-based routing
│   ├── _layout.tsx               # Root layout: AuthProvider + navigation guard
│   ├── index.tsx                 # Entry redirect
│   ├── +not-found.tsx            # 404 screen
│   ├── (auth)/                   # Unauthenticated screens (login, OTP, setup)
│   │   ├── _layout.tsx           # Auth group layout (Stack)
│   │   ├── login.tsx             # Phone number entry + reCAPTCHA
│   │   ├── otp.tsx               # OTP verification
│   │   └── business-setup.tsx    # Shop registration form
│   └── (tabs)/                   # Authenticated screens (bottom tab navigator)
│       ├── _layout.tsx           # Tab bar configuration (Ionicons, dark theme)
│       ├── dashboard.tsx         # Home: metrics, quick actions, recent activity
│       ├── products.tsx          # Full CRUD: list, add, edit (dynamic)
│       ├── sales.tsx             # Billing (placeholder — next priority)
│       ├── customers.tsx         # Customer management (placeholder)
│       └── inventory.tsx         # Stock management (placeholder)
├── components/
│   └── FirebaseRecaptchaVerifierModal.tsx  # Custom reCAPTCHA for Firebase Phone Auth
├── context/
│   └── AuthContext.tsx            # Global auth state (Firebase user + business membership)
├── lib/
│   ├── auth.ts                   # sendPhoneOtp, verifyPhoneOtp, userHasBusiness
│   ├── firebase.ts               # Firebase app + auth singleton
│   ├── firebaseConfig.ts         # Firebase web config from env vars
│   ├── otpSession.ts             # In-memory OTP session (verificationId)
│   ├── phone.ts                  # Phone number validation (India +91)
│   ├── supabase.ts               # Supabase client (with Firebase token injection)
│   └── theme.ts                  # Centralized dark theme color tokens
├── supabase/
│   └── migrations/
│       ├── 20260813120000_enums_and_tables.sql    # 6 enums, 11 tables, 7 triggers
│       └── 20260813120002_rls_and_policies.sql    # RLS + 50+ policies
├── types/
│   └── firebase-auth-rn.d.ts     # TypeScript shim for Firebase Auth in RN
├── .env                          # Local secrets (git-ignored)
├── .env.example                  # Template for required env vars
├── app.config.js                 # Expo config (reads from .env)
├── babel.config.js               # Babel preset for Expo
├── metro.config.js               # Metro bundler config (Firebase shims)
├── package.json                  # Dependencies
└── tsconfig.json                 # TypeScript config
```

---

## 4. Architecture Deep-Dive

### Request Flow (Bird's Eye View)

```
┌─────────────────────────────────────────────────────────┐
│                    MOBILE APP (Expo)                     │
│                                                         │
│  ┌──────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │ Firebase  │──▶│ AuthContext   │──▶│ Supabase Client│  │
│  │ Phone Auth│   │ (user state) │   │ (accessToken)  │  │
│  └──────────┘   └──────────────┘   └───────┬────────┘  │
│                                             │           │
└─────────────────────────────────────────────┼───────────┘
                                              │ HTTPS + JWT
                                              ▼
┌─────────────────────────────────────────────────────────┐
│                    SUPABASE CLOUD                        │
│                                                         │
│  ┌──────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │ PostgREST │──▶│ PostgreSQL   │──▶│ Row Level      │  │
│  │ (REST API)│   │ (13 tables)  │   │ Security (RLS) │  │
│  └──────────┘   └──────────────┘   └────────────────┘  │
│                                                         │
│  RLS verifies: auth.jwt()->>'sub' ∈ business_users     │
│  for EVERY read/write on tenant-owned tables            │
└─────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

1. **No Backend Server (MVP)**: The mobile app talks directly to Supabase's PostgREST API. Security is enforced entirely at the database level through RLS. This eliminates an entire deployment tier for the MVP.

2. **Firebase as SMS-Only Bridge**: Firebase is used exclusively for free OTP delivery. It is NOT the system of record for user identity. The Firebase ID token is injected into every Supabase request via the `accessToken` callback in the Supabase client.

3. **Tenant Isolation via Database Triggers**: Beyond RLS policies, PostgreSQL triggers enforce that child records (sale_items, purchase_items) always belong to the same `business_id` as their parent. This is defense-in-depth — even if a policy has a bug, the trigger prevents cross-tenant data corruption.

4. **Future API Insertion Point**: Screens are designed so that when a Spring Boot API is added post-MVP, the Supabase client calls can be swapped for REST calls without restructuring the UI layer.

---

## 5. Authentication Bridge (Firebase → Supabase)

This is the most non-obvious part of the architecture and deserves detailed explanation.

### The Problem

- Supabase Auth provides RLS integration via `auth.uid()`, but its built-in phone OTP has cost implications at scale.
- Firebase Phone Auth offers a generous free tier, but Firebase IDs are strings (not UUIDs), and Firebase has no concept of Supabase RLS.

### The Solution

```
User enters phone ──▶ Firebase sends OTP ──▶ User enters code
                                                    │
                                              Firebase verifies
                                                    │
                                              App gets Firebase
                                              ID token (JWT)
                                                    │
                                              Supabase client
                                              injects this JWT
                                              via `accessToken`
                                                    │
                                              PostgreSQL RLS
                                              reads `auth.jwt()
                                              ->>'sub'` to get
                                              the Firebase UID
                                                    │
                                              business_users.user_id
                                              matches Firebase UID
                                              (stored as TEXT, not UUID)
```

### Critical Implementation Details

| Aspect | Detail |
|---|---|
| `business_users.user_id` | Column type is `TEXT` (not UUID) to store Firebase UIDs |
| RLS identity resolution | All policies use `(auth.jwt() ->> 'sub')` instead of `auth.uid()` |
| Token injection | `supabase.ts` uses the `accessToken` option to call `firebase.currentUser.getIdToken()` on every request |
| Policy grants | All policies grant to `anon, authenticated` (not just `authenticated`) because the Firebase JWT doesn't create a Supabase session |

---

## 6. Data Model (13 Core Tables)

### Enums

| Enum | Values | Used By |
|---|---|---|
| `business_type` | retail, wholesale, both | businesses |
| `business_role` | owner, staff | business_users |
| `sale_payment_type` | cash, upi, credit, partial | sales |
| `payment_direction` | received, paid | payments |
| `customer_type` | cash, credit | customers |
| `ledger_entry_type` | debit, credit | ledger_transactions |

### Tables

| # | Table | Tenant-Owned? | Key Columns | Purpose |
|---|---|---|---|---|
| 1 | `businesses` | Root | name, owner_phone, business_type, gstin | One row per shop |
| 2 | `business_users` | Membership | business_id, user_id (TEXT), role | Maps Firebase UIDs to shops |
| 3 | `products` | Yes | name, category, unit, purchase/sale/wholesale price, moq | Product catalog |
| 4 | `customers` | Yes | name, phone, customer_type, credit_limit | Party master for sales |
| 5 | `suppliers` | Yes | name, phone, address | Party master for purchases |
| 6 | `sales` | Yes | customer_id, total_amount, payment_type | Billing header |
| 7 | `sale_items` | Inherited | sale_id, product_id, quantity, unit_price, subtotal | Billing line items |
| 8 | `purchases` | Yes | supplier_id, total_amount | Stock-in header |
| 9 | `purchase_items` | Inherited | purchase_id, product_id, quantity, unit_cost | Stock-in line items |
| 10 | `payments` | Yes | related_type, amount, direction, method | Cash/UPI payments |
| 11 | `ledger_transactions` | Yes | customer_id/supplier_id, amount, transaction_type | Udhaar/credit tracking |
| 12 | `inventory_transactions` | Yes | product_id, quantity_change, reason, source_type | Stock movement audit |

---

## 7. Table Relationships (ER Diagram)

```
                              ┌─────────────────┐
                              │   businesses     │
                              │ ───────────────  │
                              │ id (PK)          │
                              │ name             │
                              │ business_type    │
                              │ owner_phone      │
                              │ gstin            │
                              └────────┬─────────┘
                                       │ 1
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼ N                ▼ N                ▼ N
          ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
          │ business_users   │ │   products       │ │   customers      │
          │ ───────────────  │ │ ───────────────  │ │ ───────────────  │
          │ user_id (TEXT)   │ │ name, unit       │ │ name, phone      │
          │ role             │ │ purchase_price   │ │ customer_type    │
          │ business_id (FK) │ │ sale_price       │ │ credit_limit     │
          └─────────────────┘ │ wholesale_price?  │ │ business_id (FK) │
                              │ moq?             │ └────────┬─────────┘
                              │ business_id (FK) │          │
                              └───────┬──────────┘          │
                                      │                     │
                   ┌──────────────────┤                     │
                   │                  │                     │
                   ▼ N                ▼ N                   ▼ N
          ┌────────────────┐ ┌─────────────────┐ ┌─────────────────┐
          │ sale_items      │ │ inventory_txns   │ │   sales          │
          │ ──────────────  │ │ ───────────────  │ │ ───────────────  │
          │ sale_id (FK)    │ │ product_id (FK)  │ │ customer_id (FK) │
          │ product_id (FK) │ │ quantity_change  │ │ total_amount     │
          │ quantity         │ │ reason           │ │ payment_type     │
          │ unit_price       │ │ source_type      │ │ business_id (FK) │
          └────────────────┘ └─────────────────┘ └─────────────────┘

    Also: suppliers, purchases, purchase_items, payments, ledger_transactions
    (follow the same FK → businesses pattern)
```

### Cross-Tenant Safety Triggers

Every parent-child relationship is protected by a PostgreSQL trigger that verifies both records belong to the same `business_id`:

| Trigger | Protects | Ensures |
|---|---|---|
| `sales_same_business_customer` | sales | customer belongs to same business |
| `sale_items_same_business` | sale_items | product and sale share business_id |
| `purchases_same_business_supplier` | purchases | supplier belongs to same business |
| `purchase_items_same_business` | purchase_items | product and purchase share business_id |
| `inventory_same_business_product` | inventory_transactions | product belongs to same business |
| `ledger_same_business_customer` | ledger_transactions | customer belongs to same business |
| `ledger_same_business_supplier` | ledger_transactions | supplier belongs to same business |

---

## 8. Row Level Security (RLS)

RLS is enabled on **every** tenant-owned table. The core pattern:

```sql
-- Helper function used by ALL policies
CREATE FUNCTION user_belongs_to_business(p_business_id uuid)
  SELECT EXISTS (
    SELECT 1 FROM business_users
    WHERE business_id = p_business_id
      AND user_id = (auth.jwt() ->> 'sub')  -- Firebase UID
  );

-- Example policy (same pattern on all 11 tables)
CREATE POLICY products_select ON products
  FOR SELECT TO anon, authenticated
  USING (user_belongs_to_business(business_id));
```

### Security Invariants (Non-Negotiable)

1. Every tenant-owned table has a `business_id` FK to `businesses`.
2. RLS is enabled and enforced before any pilot data enters.
3. `service_role` key NEVER ships in the mobile binary — only `anon` key.
4. Client-supplied `business_id` is NEVER trusted alone; every policy re-verifies membership.
5. Line items inherit tenancy from parent (no `business_id` column on `sale_items` / `purchase_items`).

---

## 9. Business Type Handling (Hybrid)

The `business_type` enum (`retail` | `wholesale` | `both`) drives conditional UI rendering — it does NOT require separate codepaths or app versions.

| Business Type | Product Form Shows | Billing Will Show |
|---|---|---|
| **Retail** | Name, unit, purchase price, sale price | Sale price, discount |
| **Wholesale** | + wholesale_price, MOQ | + wholesale price, MOQ enforcement |
| **Both** | All fields visible | Rate auto-selected by customer tag |

**Implementation**: The Products screen fetches `business_type` from the `businesses` table on mount and conditionally renders wholesale fields:

```typescript
{(businessInfo?.business_type === 'wholesale' || businessInfo?.business_type === 'both') && (
  <View>
    <TextInput placeholder="Wholesale Price" />
    <TextInput placeholder="MOQ" />
  </View>
)}
```

Wholesale columns (`wholesale_price`, `moq`) are nullable at the schema level, so a Retail shop upgrading to Wholesale requires zero migrations — just fill in the empty fields.

---

## 10. Screen-by-Screen Breakdown

### Auth Flow

| Screen | File | Status | What It Does |
|---|---|---|---|
| Login | `app/(auth)/login.tsx` | ✅ Done | Phone input + reCAPTCHA → sends OTP via Firebase |
| OTP | `app/(auth)/otp.tsx` | ✅ Done | 6-digit code entry → Firebase verify → session created |
| Business Setup | `app/(auth)/business-setup.tsx` | ✅ Done | Register shop name, address, type, GSTIN → inserts `businesses` row |

### Main App (Tab Navigator)

| Screen | File | Status | What It Does |
|---|---|---|---|
| Dashboard | `app/(tabs)/dashboard.tsx` | Shell | Metrics cards (placeholder), quick actions, recent activity |
| Products | `app/(tabs)/products.tsx` | ✅ Done | Full CRUD (list/add/edit), search, stock status, wholesale-aware |
| Sales | `app/(tabs)/sales.tsx` | Placeholder | Billing flow (next priority) |
| Customers | `app/(tabs)/customers.tsx` | Placeholder | Customer + udhaar management |
| Inventory | `app/(tabs)/inventory.tsx` | Placeholder | Stock-in, adjustments |

---

## 11. Design System

All screens share a single design language defined in `lib/theme.ts`:

```typescript
export const Colors = {
  bg: '#161310',            // Deep dark background
  surface: '#221c17',       // Card/container background
  surfaceRaised: '#2a231c', // Elevated surface (modals, tooltips)
  accent: '#c45c26',        // Primary action (CTA buttons)
  accentInk: '#e07a3d',     // Text on accent backgrounds
  accentDim: 'rgba(196, 92, 38, 0.18)', // Subtle accent tint
  textPrimary: '#efe6d8',   // Main text (warm off-white)
  textSecondary: '#a39480', // Labels, hints, secondary info
  border: '#3c332a',        // Card borders, dividers
  warn: '#c9a227',          // Low stock, validation warnings
  ok: '#8aa36a',            // In stock, success states
  hairline: '#2f2923',      // Ultra-thin separators
};
```

### Design Principles

- **Dark-first**: Warm earthy palette designed for long daily use in Indian shop lighting
- **Typography hierarchy**: `kicker` (10-12px uppercase) → `title` (28px bold) → `body` (15-16px)
- **Card-based layout**: `borderRadius: 16`, `borderWidth: 1`, `borderColor: Colors.border`
- **Consistent spacing**: `paddingHorizontal: 20-24`, `gap: 12-20`

---

## 12. AI-Powered Features Roadmap

The following AI capabilities are planned for post-MVP phases. The data model and architecture are already designed to support these features:

### Phase 2: Smart Inventory (Q4 2026)

| Feature | Description | Data Source |
|---|---|---|
| **Demand Forecasting** | Predict which products will sell in the coming week using historical sales patterns | `sales` + `sale_items` time-series data |
| **Reorder Alerts** | AI-driven "You should reorder X" notifications based on sales velocity vs. current stock | `inventory_transactions` + sales velocity |
| **Dynamic Pricing Suggestions** | Suggest optimal wholesale/retail pricing based on purchase cost, competition, and demand | `products.purchase_price` + regional market data |

### Phase 3: Customer Intelligence (Q1 2027)

| Feature | Description | Data Source |
|---|---|---|
| **Credit Risk Scoring** | Predict likelihood of udhaar repayment based on customer payment history | `ledger_transactions` + `payments` history |
| **Customer Segmentation** | Auto-tag customers as "high-value", "at-risk", "new" for targeted engagement | `sales` frequency + `payments` patterns |
| **Payment Reminder Optimization** | AI determines the best time and channel to send payment reminders | `ledger_transactions` timestamps + payment response rates |

### Phase 4: Business Intelligence (Q2 2027)

| Feature | Description | Data Source |
|---|---|---|
| **Natural Language Reports** | "Show me my top 5 products this month" → instant chart/answer | All tables, processed via LLM |
| **Anomaly Detection** | Alert when daily sales deviate significantly from historical patterns | `sales` time-series analysis |
| **Cash Flow Forecasting** | Predict cash position for the next 7/30 days | `payments` + `sales` + `purchases` |
| **Supplier Optimization** | Recommend which suppliers to prioritize based on price, reliability, and lead time | `purchases` + `purchase_items` + `suppliers` |

### AI Technical Architecture (Planned)

```
Mobile App ──▶ Spring Boot API ──▶ PostgreSQL (Supabase)
                     │                      │
                     │                      ▼
                     │              AI Feature Pipeline
                     │              ┌───────────────────┐
                     │              │ 1. Data Extraction │
                     │              │ 2. Feature Eng.    │
                     │              │ 3. Model Inference │
                     │              │ 4. Result Cache    │
                     │              └───────────────────┘
                     │                      │
                     ▼                      ▼
              AI Response API      Scheduled Jobs (Cron)
              (real-time)          (batch predictions)
```

---

## 13. Getting Started (Developer Setup)

### Prerequisites

- Node.js 18+ and npm
- Expo Go app on your Android/iOS device
- A Supabase project (free tier works)
- A Firebase project with Phone Auth enabled

### Setup Steps

```bash
# 1. Clone the repo
git clone <repo-url>
cd merchant-desk-app

# 2. Install dependencies
npm install

# 3. Copy environment template
cp .env.example .env

# 4. Fill in your .env (see section 14)

# 5. Apply database migrations
#    Copy contents of supabase/migrations/*.sql into Supabase SQL Editor and run

# 6. Grant permissions (required after fresh schema creation)
#    Run this in Supabase SQL Editor:
#    GRANT USAGE ON SCHEMA public TO anon, authenticated;
#    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
#    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
#    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;
#    NOTIFY pgrst, 'reload schema';

# 7. Start the dev server
npm run start
```

---

## 14. Environment Variables

| Variable | Description | Where to Find |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Supabase Dashboard → Settings → API |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (NEVER service_role) | Same page |
| `EXPO_PUBLIC_USE_FIREBASE` | Set to `true` to enable Firebase OTP | — |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Firebase Web API key | Firebase Console → Project Settings |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase auth domain | Same page |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID | Same page |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | Same page |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID | Same page |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | Firebase app ID | Same page |

> **Security**: The `.env` file is git-ignored. Never commit secrets. Only `.env.example` (with placeholder values) is tracked.

---

## 15. Database Migrations

Migrations live in `supabase/migrations/` and are applied via the Supabase SQL Editor:

| File | Purpose | Tables/Objects Created |
|---|---|---|
| `20260813120000_enums_and_tables.sql` | Core schema | 6 enums, 11 tables, 5 trigger functions, 7 triggers |
| `20260813120002_rls_and_policies.sql` | Security layer | 4 helper functions, 50+ RLS policies, 1 auto-owner trigger |

### Migration Order

Always apply in filename order. The second migration depends on tables from the first.

---

## 16. Pilot Plan

- **Target**: 5-10 shops in Sahebganj area (Jharkhand, India)
- **Focus**: Wholesale-heavy businesses (grains, spices, dry fruit, jaggery distributors)
- **Distribution**: Direct APK / Expo Go install — no Play Store until stable
- **Validation**: In-person shop visits to observe real counter workflows
- **Known Risk**: Tier-3 connectivity — offline support is deferred but pilot feedback will determine if it needs to be prioritized

---

## 17. Known Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Poor connectivity in Sahebganj | App unusable during network drops | Capture pilot feedback; evaluate offline-first (SQLite + sync) for Phase 2 |
| Firebase free tier quota exhaustion | OTP stops working | Monitor usage; Supabase built-in OTP as fallback |
| Single-device usage assumption | Staff can't use on their own devices | `business_users` table already supports multi-user; staff invite flow is post-MVP |
| Data loss if merchant loses phone | All data is cloud-only | Supabase automatic backups; re-login restores everything |

---

## 18. Contributing

1. Follow the existing design system (`lib/theme.ts`) — do not introduce new color palettes
2. Every tenant-owned table must have RLS policies before merging
3. No hardcoded/placeholder data in production screens
4. TypeScript strict mode — no `any` types without explicit justification
5. Test on actual Android devices (pilot is Android-first)

---

## 19. License

Private — All rights reserved. Pilot distribution only.
