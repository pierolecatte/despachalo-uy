-- =====================================================
-- despachalo.uy — Esquema de Base de Datos
-- Ejecutar en Supabase SQL Editor (Dashboard > SQL)
-- =====================================================

-- 1. EXTENSIONES
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TIPOS ENUM
-- =====================================================
CREATE TYPE org_type AS ENUM ('remitente', 'cadeteria', 'agencia', 'admin');
CREATE TYPE user_role AS ENUM ('super_admin', 'org_admin', 'cadete', 'operador');
CREATE TYPE shipment_status AS ENUM ('pendiente', 'levantado', 'despachado', 'en_transito', 'entregado', 'con_problema');
CREATE TYPE delivery_type AS ENUM ('domicilio', 'sucursal');
CREATE TYPE package_size AS ENUM ('chico', 'mediano', 'grande');
CREATE TYPE photo_type AS ENUM ('comprobante', 'paquete', 'etiqueta');
CREATE TYPE notification_channel AS ENUM ('email', 'whatsapp', 'push');
CREATE TYPE notification_status AS ENUM ('pendiente', 'enviada', 'fallida');
CREATE TYPE pricing_mode AS ENUM ('fijo', 'por_zona', 'por_km', 'por_hora', 'custom');
CREATE TYPE coverage_area AS ENUM ('metropolitana', 'interior', 'ambos');
CREATE TYPE service_type_code AS ENUM ('despacho_agencia', 'express_24h', 'comun_48h', 'por_km', 'por_horas', 'especial');
CREATE TYPE invoice_status AS ENUM ('pendiente', 'pagada');

-- 3. TABLAS
-- =====================================================

-- Organizaciones (multi-tenant)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type org_type NOT NULL,
    linked_remitente_id UUID REFERENCES organizations(id),
    is_internal_cadeteria BOOLEAN NOT NULL DEFAULT FALSE,
    logo_url TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    latitude DECIMAL,
    longitude DECIMAL,
    settings JSONB DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Usuarios del sistema
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id),
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'operador',
    phone TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    default_permissions JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Permisos granulares por usuario
CREATE TABLE user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission TEXT NOT NULL,
    granted BOOLEAN NOT NULL DEFAULT TRUE,
    granted_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, permission)
);

-- Tipos de servicio que ofrece cada cadetería
CREATE TABLE service_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    code service_type_code NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    pricing_mode pricing_mode NOT NULL DEFAULT 'fijo',
    base_price DECIMAL DEFAULT 0,
    price_per_km DECIMAL,
    price_per_hour DECIMAL,
    coverage_area coverage_area NOT NULL DEFAULT 'ambos',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Envíos (tabla principal)
CREATE TABLE shipments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    remitente_org_id UUID NOT NULL REFERENCES organizations(id),
    cadeteria_org_id UUID REFERENCES organizations(id),
    agencia_org_id UUID REFERENCES organizations(id),
    cadete_user_id UUID REFERENCES users(id),
    service_type_id UUID REFERENCES service_types(id),
    tracking_code TEXT NOT NULL UNIQUE,
    external_tracking TEXT,
    status shipment_status NOT NULL DEFAULT 'pendiente',
    recipient_name TEXT NOT NULL,
    recipient_phone TEXT,
    recipient_email TEXT,
    recipient_city TEXT,
    recipient_department TEXT,
    recipient_address TEXT,
    delivery_type delivery_type NOT NULL DEFAULT 'domicilio',
    package_size package_size NOT NULL DEFAULT 'mediano',
    package_count INTEGER NOT NULL DEFAULT 1,
    weight_kg DECIMAL,
    description TEXT,
    qr_code_url TEXT,
    label_url TEXT,
    shipping_cost DECIMAL,
    service_cost DECIMAL,
    distance_km DECIMAL,
    hours_worked DECIMAL,
    notes TEXT,
    recipient_observations TEXT,
    recipient_lat DECIMAL,
    recipient_lng DECIMAL,
    pickup_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Eventos/historial de cada envío
CREATE TABLE shipment_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    event_type TEXT NOT NULL,
    description TEXT,
    latitude DECIMAL,
    longitude DECIMAL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fotos de envíos (comprobantes, paquetes, etiquetas)
CREATE TABLE shipment_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES users(id),
    photo_url TEXT NOT NULL,
    photo_type photo_type NOT NULL DEFAULT 'comprobante',
    ai_extracted_data JSONB,
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tarifas por zona/servicio
CREATE TABLE tariffs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    service_type_id UUID NOT NULL REFERENCES service_types(id),
    zone_name TEXT,
    department TEXT,
    city TEXT,
    base_price DECIMAL NOT NULL DEFAULT 0,
    price_per_extra_package DECIMAL,
    size_prices JSONB DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Departamentos de Uruguay
CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE
);

-- Ciudades de Uruguay
CREATE TABLE cities (
    id SERIAL PRIMARY KEY,
    department_id INTEGER NOT NULL REFERENCES departments(id),
    name TEXT NOT NULL
);

-- Notificaciones enviadas
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    channel notification_channel NOT NULL,
    status notification_status NOT NULL DEFAULT 'pendiente',
    message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ubicaciones de cadetes (tracking en tiempo real)
CREATE TABLE cadete_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cadete_user_id UUID NOT NULL REFERENCES users(id),
    latitude DECIMAL NOT NULL,
    longitude DECIMAL NOT NULL,
    accuracy_meters DECIMAL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Facturas
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cadeteria_org_id UUID NOT NULL REFERENCES organizations(id),
    remitente_org_id UUID NOT NULL REFERENCES organizations(id),
    period TEXT NOT NULL,
    total_amount DECIMAL NOT NULL DEFAULT 0,
    status invoice_status NOT NULL DEFAULT 'pendiente',
    line_items JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. ÍNDICES
-- =====================================================

CREATE INDEX idx_users_org_id ON users(org_id);
CREATE INDEX idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_shipments_remitente ON shipments(remitente_org_id);
CREATE INDEX idx_shipments_cadeteria ON shipments(cadeteria_org_id);
CREATE INDEX idx_shipments_agencia ON shipments(agencia_org_id);
CREATE INDEX idx_shipments_cadete ON shipments(cadete_user_id);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_tracking ON shipments(tracking_code);
CREATE INDEX idx_shipment_events_shipment ON shipment_events(shipment_id);
CREATE INDEX idx_shipment_photos_shipment ON shipment_photos(shipment_id);
CREATE INDEX idx_notifications_shipment ON notifications(shipment_id);
CREATE INDEX idx_cadete_locations_user ON cadete_locations(cadete_user_id);
CREATE INDEX idx_cadete_locations_time ON cadete_locations(recorded_at DESC);
CREATE INDEX idx_tariffs_org ON tariffs(org_id);
CREATE INDEX idx_service_types_org ON service_types(org_id);
CREATE INDEX idx_cities_department ON cities(department_id);
CREATE INDEX idx_invoices_cadeteria ON invoices(cadeteria_org_id);
CREATE INDEX idx_invoices_remitente ON invoices(remitente_org_id);

-- 5. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadete_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Función helper: obtener el org_id del usuario actual
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM users WHERE auth_user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Función helper: obtener el rol del usuario actual
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM users WHERE auth_user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Función helper: verificar si el usuario es super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM users 
    WHERE auth_user_id = auth.uid() AND role = 'super_admin'
  )
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- =====================================================
-- POLÍTICAS RLS
-- =====================================================

-- Departamentos y Ciudades: lectura pública
CREATE POLICY "departments_read_all" ON departments FOR SELECT USING (true);
CREATE POLICY "cities_read_all" ON cities FOR SELECT USING (true);

-- Organizaciones
CREATE POLICY "orgs_super_admin_all" ON organizations
    FOR ALL USING (is_super_admin());

CREATE POLICY "orgs_read_own" ON organizations
    FOR SELECT USING (id = get_user_org_id());

-- Usuarios
CREATE POLICY "users_super_admin_all" ON users
    FOR ALL USING (is_super_admin());

CREATE POLICY "users_read_own_org" ON users
    FOR SELECT USING (org_id = get_user_org_id());

-- Permisos de usuario
CREATE POLICY "permissions_super_admin_all" ON user_permissions
    FOR ALL USING (is_super_admin());

CREATE POLICY "permissions_read_own" ON user_permissions
    FOR SELECT USING (
        user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    );

-- Envíos
CREATE POLICY "shipments_super_admin_all" ON shipments
    FOR ALL USING (is_super_admin());

CREATE POLICY "shipments_read_own_org" ON shipments
    FOR SELECT USING (
        remitente_org_id = get_user_org_id()
        OR cadeteria_org_id = get_user_org_id()
        OR agencia_org_id = get_user_org_id()
        OR cadete_user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    );

CREATE POLICY "shipments_insert_own_org" ON shipments
    FOR INSERT WITH CHECK (
        remitente_org_id = get_user_org_id()
    );

CREATE POLICY "shipments_update_own_org" ON shipments
    FOR UPDATE USING (
        remitente_org_id = get_user_org_id()
        OR cadeteria_org_id = get_user_org_id()
        OR agencia_org_id = get_user_org_id()
    );

-- Eventos de envío
CREATE POLICY "events_super_admin_all" ON shipment_events
    FOR ALL USING (is_super_admin());

CREATE POLICY "events_read_own" ON shipment_events
    FOR SELECT USING (
        shipment_id IN (
            SELECT id FROM shipments
            WHERE remitente_org_id = get_user_org_id()
            OR cadeteria_org_id = get_user_org_id()
            OR agencia_org_id = get_user_org_id()
        )
    );

CREATE POLICY "events_insert_authenticated" ON shipment_events
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Fotos de envío
CREATE POLICY "photos_super_admin_all" ON shipment_photos
    FOR ALL USING (is_super_admin());

CREATE POLICY "photos_read_own" ON shipment_photos
    FOR SELECT USING (
        shipment_id IN (
            SELECT id FROM shipments
            WHERE remitente_org_id = get_user_org_id()
            OR cadeteria_org_id = get_user_org_id()
            OR agencia_org_id = get_user_org_id()
        )
    );

CREATE POLICY "photos_insert_authenticated" ON shipment_photos
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Tipos de servicio
CREATE POLICY "service_types_super_admin_all" ON service_types
    FOR ALL USING (is_super_admin());

CREATE POLICY "service_types_read_all_active" ON service_types
    FOR SELECT USING (active = true);

CREATE POLICY "service_types_manage_own_org" ON service_types
    FOR ALL USING (org_id = get_user_org_id());

-- Tarifas
CREATE POLICY "tariffs_super_admin_all" ON tariffs
    FOR ALL USING (is_super_admin());

CREATE POLICY "tariffs_read_all_active" ON tariffs
    FOR SELECT USING (active = true);

CREATE POLICY "tariffs_manage_own_org" ON tariffs
    FOR ALL USING (org_id = get_user_org_id());

-- Notificaciones
CREATE POLICY "notifications_super_admin_all" ON notifications
    FOR ALL USING (is_super_admin());

CREATE POLICY "notifications_read_own" ON notifications
    FOR SELECT USING (
        shipment_id IN (
            SELECT id FROM shipments
            WHERE remitente_org_id = get_user_org_id()
            OR cadeteria_org_id = get_user_org_id()
        )
    );

-- Ubicaciones de cadetes
CREATE POLICY "locations_super_admin_all" ON cadete_locations
    FOR ALL USING (is_super_admin());

CREATE POLICY "locations_read_own_org" ON cadete_locations
    FOR SELECT USING (
        cadete_user_id IN (SELECT id FROM users WHERE org_id = get_user_org_id())
    );

CREATE POLICY "locations_insert_own" ON cadete_locations
    FOR INSERT WITH CHECK (
        cadete_user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    );

-- Facturas
CREATE POLICY "invoices_super_admin_all" ON invoices
    FOR ALL USING (is_super_admin());

CREATE POLICY "invoices_read_own_org" ON invoices
    FOR SELECT USING (
        cadeteria_org_id = get_user_org_id()
        OR remitente_org_id = get_user_org_id()
    );

-- 6. DATOS INICIALES — Departamentos de Uruguay
-- =====================================================

INSERT INTO departments (name, code) VALUES
    ('Artigas', 'AR'),
    ('Canelones', 'CA'),
    ('Cerro Largo', 'CL'),
    ('Colonia', 'CO'),
    ('Durazno', 'DU'),
    ('Flores', 'FS'),
    ('Florida', 'FD'),
    ('Lavalleja', 'LA'),
    ('Maldonado', 'MA'),
    ('Montevideo', 'MO'),
    ('Paysandú', 'PA'),
    ('Río Negro', 'RN'),
    ('Rivera', 'RI'),
    ('Rocha', 'RO'),
    ('Salto', 'SA'),
    ('San José', 'SJ'),
    ('Soriano', 'SO'),
    ('Tacuarembó', 'TA'),
    ('Treinta y Tres', 'TT');

-- 7. ORGANIZACIÓN ADMIN Y SUPER ADMIN INICIAL
-- =====================================================
-- NOTA: Después de crear tu cuenta en el sistema, ejecutar lo siguiente
-- reemplazando 'TU_AUTH_USER_ID' con el UUID de tu usuario en auth.users

-- INSERT INTO organizations (name, type, email) 
-- VALUES ('despachalo.uy', 'admin', 'admin@despachalo.uy');

-- INSERT INTO users (auth_user_id, org_id, email, full_name, role)
-- VALUES (
--     'TU_AUTH_USER_ID',
--     (SELECT id FROM organizations WHERE type = 'admin' LIMIT 1),
--     'tu@email.com',
--     'Tu Nombre',
--     'super_admin'
-- );
