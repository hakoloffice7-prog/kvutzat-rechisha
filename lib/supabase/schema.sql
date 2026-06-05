-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Cities table
CREATE TABLE cities (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects table
CREATE TABLE projects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  city_id UUID REFERENCES cities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Residents table
CREATE TABLE residents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories table
CREATE TABLE categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Suppliers table
CREATE TABLE suppliers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders table
CREATE TABLE orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  resident_id UUID REFERENCES residents(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'contact' CHECK (status IN ('contact', 'considering', 'interested', 'ordered')),
  payment_status TEXT DEFAULT 'not_paid' CHECK (payment_status IN ('not_paid', 'advance', 'paid_full')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order items table
CREATE TABLE order_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  model TEXT,
  customer_price DECIMAL(10,2) DEFAULT 0,
  supplier_price DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('considering_week', 'unpaid_order')),
  resident_id UUID REFERENCES residents(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE residents ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies - authenticated users can do everything
CREATE POLICY "Authenticated users can view cities" ON cities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert cities" ON cities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update cities" ON cities FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete cities" ON cities FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view projects" ON projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert projects" ON projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update projects" ON projects FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete projects" ON projects FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view residents" ON residents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert residents" ON residents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update residents" ON residents FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete residents" ON residents FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view categories" ON categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert categories" ON categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update categories" ON categories FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete categories" ON categories FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view suppliers" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert suppliers" ON suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update suppliers" ON suppliers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete suppliers" ON suppliers FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view orders" ON orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert orders" ON orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update orders" ON orders FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete orders" ON orders FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view order_items" ON order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert order_items" ON order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update order_items" ON order_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete order_items" ON order_items FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view notifications" ON notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update notifications" ON notifications FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete notifications" ON notifications FOR DELETE TO authenticated USING (true);

-- Function to auto-generate notifications for considering orders older than 7 days
CREATE OR REPLACE FUNCTION check_considering_orders()
RETURNS void AS $$
BEGIN
  INSERT INTO notifications (type, resident_id, order_id)
  SELECT 'considering_week', o.resident_id, o.id
  FROM orders o
  WHERE o.status = 'considering'
    AND o.created_at < NOW() - INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.order_id = o.id AND n.type = 'considering_week'
    );

  INSERT INTO notifications (type, resident_id, order_id)
  SELECT 'unpaid_order', o.resident_id, o.id
  FROM orders o
  WHERE o.status = 'ordered'
    AND o.payment_status = 'not_paid'
    AND o.created_at < NOW() - INTERVAL '3 days'
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.order_id = o.id AND n.type = 'unpaid_order'
    );
END;
$$ LANGUAGE plpgsql;

-- Indexes for performance
CREATE INDEX idx_projects_city_id ON projects(city_id);
CREATE INDEX idx_residents_project_id ON residents(project_id);
CREATE INDEX idx_orders_resident_id ON orders(resident_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
