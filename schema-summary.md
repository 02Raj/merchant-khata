# Schema + RLS summary (pre-auth, pre-app)

Review this before auth screens. Migrations are **not applied** to a live project from this step — run them in the Supabase SQL editor or via CLI when you are ready.

Env: `.env` holds `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` placeholders only. `.env` is gitignored. Never put `service_role` in the app or in `.env`.

## How tenancy is enforced

`user_belongs_to_business(business_id)` (SECURITY DEFINER) is true only when `auth.uid()` has a `business_users` row for that id. RLS policies call this function. A `business_id` sent from the client is ignored unless membership exists server-side.

`user_is_business_owner(business_id)` is the same check with `role = 'owner'`.

`sale_items` / `purchase_items` have no `business_id`; they use `user_can_access_sale` / `user_can_access_purchase`, which join to the parent row and then membership.

Creating a shop: authenticated INSERT on `businesses` → trigger `add_owner_on_business_insert` writes the creator as `owner` on `business_users`.

RLS is **enabled and FORCED** on every table below. `anon` has no table grants; `authenticated` has SELECT/INSERT/UPDATE/DELETE subject to policies.

## Tables

| Table | RLS | Policies | Notes |
| --- | --- | --- | --- |
| `businesses` | enabled + forced | `businesses_select`, `businesses_insert`, `businesses_update`, `businesses_delete` | SELECT = member (`id`). INSERT = signed-in user. UPDATE/DELETE = owner. Tenant root; no `business_id` column. |
| `business_users` | enabled + forced | `business_users_select`, `business_users_insert`, `business_users_update`, `business_users_delete` | SELECT = member of `business_id`. INSERT/UPDATE/DELETE = owner. First owner row comes from the business-insert trigger (definer), not the INSERT policy. |
| `products` | enabled + forced | `products_select`, `products_insert`, `products_update`, `products_delete` | All four: `user_belongs_to_business(business_id)` |
| `customers` | enabled + forced | `customers_select`, `customers_insert`, `customers_update`, `customers_delete` | Same membership pattern |
| `suppliers` | enabled + forced | `suppliers_select`, `suppliers_insert`, `suppliers_update`, `suppliers_delete` | Same membership pattern |
| `sales` | enabled + forced | `sales_select`, `sales_insert`, `sales_update`, `sales_delete` | Membership on `business_id`. INSERT/UPDATE also require `created_by = auth.uid()` |
| `sale_items` | enabled + forced | `sale_items_select`, `sale_items_insert`, `sale_items_update`, `sale_items_delete` | Via parent sale’s `business_id`. Trigger blocks cross-tenant `product_id` |
| `purchases` | enabled + forced | `purchases_select`, `purchases_insert`, `purchases_update`, `purchases_delete` | Same as sales (`created_by` on write) |
| `purchase_items` | enabled + forced | `purchase_items_select`, `purchase_items_insert`, `purchase_items_update`, `purchase_items_delete` | Via parent purchase. Trigger blocks cross-tenant `product_id` |
| `payments` | enabled + forced | `payments_select`, `payments_insert`, `payments_update`, `payments_delete` | Membership on `business_id`. `related_type`/`related_id` are polymorphic (no FK) |
| `ledger_transactions` | enabled + forced | `ledger_transactions_select`, `ledger_transactions_insert`, `ledger_transactions_update`, `ledger_transactions_delete` | Exactly one of `customer_id` / `supplier_id`. Same-tenant triggers on both |
| `inventory_transactions` | enabled + forced | `inventory_transactions_select`, `inventory_transactions_insert`, `inventory_transactions_update`, `inventory_transactions_delete` | Membership + product must share `business_id` |

## Policy matrix (short)

For every tenant table with a `business_id` column except `businesses` / `business_users`:

- SELECT / DELETE: `USING (user_belongs_to_business(business_id))`
- INSERT: `WITH CHECK (user_belongs_to_business(business_id))`
- UPDATE: both USING and WITH CHECK on membership (so you cannot move a row to another tenant)

## Migrations (apply in order)

1. `supabase/migrations/20260813120000_enums_and_tables.sql`
2. `supabase/migrations/20260813120001_indexes.sql`
3. `supabase/migrations/20260813120002_rls_and_policies.sql`

No DROP / TRUNCATE in these files.
