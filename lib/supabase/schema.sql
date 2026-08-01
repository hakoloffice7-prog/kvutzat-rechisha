-- =============================================================
--  קבוצות רכישה - סכמה מלאה (להתקנה נקייה)
--  מבוסס על ניתוח קובץ הלקוח האמיתי "שמות והזמנות הלקוחות.xlsx"
-- =============================================================

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

-- Residents (customers) table
CREATE TABLE residents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  phone2 TEXT,                 -- נייד נוסף
  email TEXT,                  -- מייל
  key_location TEXT,           -- מיקום מפתח
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories (products/services) table
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
  phone2 TEXT,                           -- טלפון נוסף
  email TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  advance_amount DECIMAL(10,2) DEFAULT 0, -- מקדמה ששילמנו לספק עבור ביצוע עבודה
  advance_note TEXT,                      -- הערה על המקדמה
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supplier <-> Project ledger (עמלת ספק ועמלת נציג מכירות, מפורק לפי פרויקט)
CREATE TABLE supplier_project_ledger (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  commission_paid DECIMAL(10,2) DEFAULT 0,  -- עמלה ששילם הספק לנו בפועל (עבור הפרויקט הזה)
  rep_name TEXT,                            -- שם נציג המכירות של הפרויקט
  rep_percent DECIMAL(5,2) DEFAULT 1.25,    -- אחוז עמלת הנציג
  rep_paid DECIMAL(10,2) DEFAULT 0,         -- מה ששולם בפועל לנציג
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (supplier_id, project_id)
);

-- Orders table (a resident's interest/order in a specific product)
CREATE TABLE orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  resident_id UUID REFERENCES residents(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  -- Pipeline: לברר -> מעוניין / מתלבט -> נמדד -> הצעת מחיר -> הזמין -> בוטל
  status TEXT DEFAULT 'lead' CHECK (status IN
    ('lead', 'interested', 'considering', 'measured', 'quoted', 'ordered', 'cancelled')),
  payment_status TEXT DEFAULT 'not_paid' CHECK (payment_status IN
    ('not_paid', 'advance', 'paid_full')),
  measurements TEXT,           -- מדידות (טקסט חופשי, למשל "2 דלת 5 חלון")
  total_price DECIMAL(10,2) DEFAULT 0,   -- מחיר לתשלום / סיכום
  deposit DECIMAL(10,2) DEFAULT 0,       -- מקדמה
  approved BOOLEAN DEFAULT FALSE,        -- מאשר / אישור
  installed BOOLEAN DEFAULT FALSE,       -- התקנה
  details JSONB DEFAULT '{}'::jsonb,     -- שדות ספציפיים למוצר (הגבהה/נפתח/צורה/דגם וכו')
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order items table (פירוט פריטים - אופציונלי, כשמפרטים כל פריט בנפרד)
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

-- =============================================================
--  Row Level Security
-- =============================================================
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE residents ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_project_ledger ENABLE ROW LEVEL SECURITY;
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

CREATE POLICY "Authenticated users can view supplier_project_ledger" ON supplier_project_ledger FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert supplier_project_ledger" ON supplier_project_ledger FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update supplier_project_ledger" ON supplier_project_ledger FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete supplier_project_ledger" ON supplier_project_ledger FOR DELETE TO authenticated USING (true);

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

-- =============================================================
--  Notifications helper function
-- =============================================================
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

-- =============================================================
--  Indexes
-- =============================================================
CREATE INDEX idx_projects_city_id ON projects(city_id);
CREATE INDEX idx_residents_project_id ON residents(project_id);
CREATE INDEX idx_orders_resident_id ON orders(resident_id);
CREATE INDEX idx_orders_category_id ON orders(category_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_supplier_project_ledger_supplier_id ON supplier_project_ledger(supplier_id);
CREATE INDEX idx_supplier_project_ledger_project_id ON supplier_project_ledger(project_id);

-- =============================================================
--  Seed: products/services offered by the purchase group
--  (מתוך טאב "לקוחות" בקובץ הלקוח)
-- =============================================================
INSERT INTO categories (name) VALUES
  ('מזגנים'),
  ('סורגים'),
  ('רשתות'),
  ('ווילונות'),
  ('מטבחים / השלמת מטבח'),
  ('שיש'),
  ('בדק בית'),
  ('הדברה'),
  ('ניקיון'),
  ('ריהוט'),
  ('מוצרי חשמל')
ON CONFLICT DO NOTHING;
