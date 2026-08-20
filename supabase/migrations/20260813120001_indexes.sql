-- Indexes on tenant keys and hot foreign keys

CREATE INDEX idx_business_users_business_id ON public.business_users (business_id);
CREATE INDEX idx_business_users_user_id ON public.business_users (user_id);

CREATE INDEX idx_products_business_id ON public.products (business_id);
CREATE INDEX idx_products_business_id_active ON public.products (business_id) WHERE is_active;
CREATE INDEX idx_products_business_id_category ON public.products (business_id, category);

CREATE INDEX idx_customers_business_id ON public.customers (business_id);
CREATE INDEX idx_customers_business_id_phone ON public.customers (business_id, phone);

CREATE INDEX idx_suppliers_business_id ON public.suppliers (business_id);
CREATE INDEX idx_suppliers_business_id_phone ON public.suppliers (business_id, phone);

CREATE INDEX idx_sales_business_id ON public.sales (business_id);
CREATE INDEX idx_sales_customer_id ON public.sales (customer_id);
CREATE INDEX idx_sales_created_by ON public.sales (created_by);
CREATE INDEX idx_sales_business_id_created_at ON public.sales (business_id, created_at DESC);

CREATE INDEX idx_sale_items_sale_id ON public.sale_items (sale_id);
CREATE INDEX idx_sale_items_product_id ON public.sale_items (product_id);

CREATE INDEX idx_purchases_business_id ON public.purchases (business_id);
CREATE INDEX idx_purchases_supplier_id ON public.purchases (supplier_id);
CREATE INDEX idx_purchases_created_by ON public.purchases (created_by);
CREATE INDEX idx_purchases_business_id_created_at ON public.purchases (business_id, created_at DESC);

CREATE INDEX idx_purchase_items_purchase_id ON public.purchase_items (purchase_id);
CREATE INDEX idx_purchase_items_product_id ON public.purchase_items (product_id);

CREATE INDEX idx_payments_business_id ON public.payments (business_id);
CREATE INDEX idx_payments_related ON public.payments (related_type, related_id);
CREATE INDEX idx_payments_business_id_created_at ON public.payments (business_id, created_at DESC);

CREATE INDEX idx_ledger_business_id ON public.ledger_transactions (business_id);
CREATE INDEX idx_ledger_customer_id ON public.ledger_transactions (customer_id);
CREATE INDEX idx_ledger_supplier_id ON public.ledger_transactions (supplier_id);
CREATE INDEX idx_ledger_source ON public.ledger_transactions (source_type, source_id);
CREATE INDEX idx_ledger_business_id_created_at ON public.ledger_transactions (business_id, created_at DESC);

CREATE INDEX idx_inventory_business_id ON public.inventory_transactions (business_id);
CREATE INDEX idx_inventory_product_id ON public.inventory_transactions (product_id);
CREATE INDEX idx_inventory_source ON public.inventory_transactions (source_type, source_id);
CREATE INDEX idx_inventory_business_id_created_at ON public.inventory_transactions (business_id, created_at DESC);
