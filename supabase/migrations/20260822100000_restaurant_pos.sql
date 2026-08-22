-- Add values to enums
ALTER TYPE public.business_type ADD VALUE IF NOT EXISTS 'restaurant';
ALTER TYPE public.business_role ADD VALUE IF NOT EXISTS 'waiter';

-- Create New Enums
CREATE TYPE public.order_status AS ENUM ('open', 'billed', 'paid', 'cancelled');
CREATE TYPE public.item_status AS ENUM ('pending', 'sent', 'cancelled');
CREATE TYPE public.order_type AS ENUM ('dine_in', 'takeaway');

-- Modify Existing Tables
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS fssai_number TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS track_stock BOOLEAN DEFAULT TRUE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_available_today BOOLEAN DEFAULT TRUE;

-- Create New Tables
CREATE TABLE public.tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  table_id UUID REFERENCES public.tables (id) ON DELETE SET NULL,
  type public.order_type DEFAULT 'dine_in',
  invoice_number INT NULL,
  status public.order_status DEFAULT 'open',
  kot_count INT DEFAULT 0,
  waiter_id TEXT, -- tied to user_id text
  total_amount NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  qty INT NOT NULL,
  unit_price NUMERIC NOT NULL,
  kot_number INT NULL,
  status public.item_status DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.cancel_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES public.order_items (id) ON DELETE CASCADE,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  requested_by TEXT, -- using user text id
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tables_business_id ON public.tables (business_id);
CREATE INDEX idx_orders_business_id ON public.orders (business_id);
CREATE INDEX idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX idx_cancel_requests_order_item_id ON public.cancel_requests (order_item_id);

-- RLS Setup
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancel_requests ENABLE ROW LEVEL SECURITY;

-- Shared RLS logic: user must be part of business_users for the business_id
-- Tables
CREATE POLICY tables_select ON public.tables FOR SELECT USING (business_id IN (SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()::text));
CREATE POLICY tables_insert ON public.tables FOR INSERT WITH CHECK (business_id IN (SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()::text));
CREATE POLICY tables_update ON public.tables FOR UPDATE USING (business_id IN (SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()::text));
CREATE POLICY tables_delete ON public.tables FOR DELETE USING (business_id IN (SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()::text));

-- Orders
CREATE POLICY orders_select ON public.orders FOR SELECT USING (business_id IN (SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()::text));
CREATE POLICY orders_insert ON public.orders FOR INSERT WITH CHECK (business_id IN (SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()::text));
CREATE POLICY orders_update ON public.orders FOR UPDATE USING (business_id IN (SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()::text));
CREATE POLICY orders_delete ON public.orders FOR DELETE USING (business_id IN (SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()::text));

-- Order Items
CREATE POLICY order_items_select ON public.order_items FOR SELECT USING (
  order_id IN (
    SELECT o.id FROM public.orders o 
    JOIN public.business_users bu ON o.business_id = bu.business_id 
    WHERE bu.user_id = auth.uid()::text
  )
);
CREATE POLICY order_items_insert ON public.order_items FOR INSERT WITH CHECK (
  order_id IN (
    SELECT o.id FROM public.orders o 
    JOIN public.business_users bu ON o.business_id = bu.business_id 
    WHERE bu.user_id = auth.uid()::text
  )
);
CREATE POLICY order_items_update ON public.order_items FOR UPDATE USING (
  order_id IN (
    SELECT o.id FROM public.orders o 
    JOIN public.business_users bu ON o.business_id = bu.business_id 
    WHERE bu.user_id = auth.uid()::text
  )
);
CREATE POLICY order_items_delete ON public.order_items FOR DELETE USING (
  order_id IN (
    SELECT o.id FROM public.orders o 
    JOIN public.business_users bu ON o.business_id = bu.business_id 
    WHERE bu.user_id = auth.uid()::text
  )
);

-- Cancel Requests
CREATE POLICY cancel_requests_select ON public.cancel_requests FOR SELECT USING (
  order_item_id IN (
    SELECT oi.id FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    JOIN public.business_users bu ON o.business_id = bu.business_id
    WHERE bu.user_id = auth.uid()::text
  )
);
CREATE POLICY cancel_requests_insert ON public.cancel_requests FOR INSERT WITH CHECK (
  order_item_id IN (
    SELECT oi.id FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    JOIN public.business_users bu ON o.business_id = bu.business_id
    WHERE bu.user_id = auth.uid()::text
  )
);
CREATE POLICY cancel_requests_update ON public.cancel_requests FOR UPDATE USING (
  order_item_id IN (
    SELECT oi.id FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    JOIN public.business_users bu ON o.business_id = bu.business_id
    WHERE bu.user_id = auth.uid()::text
  )
);
CREATE POLICY cancel_requests_delete ON public.cancel_requests FOR DELETE USING (
  order_item_id IN (
    SELECT oi.id FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    JOIN public.business_users bu ON o.business_id = bu.business_id
    WHERE bu.user_id = auth.uid()::text
  )
);
