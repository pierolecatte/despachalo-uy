-- =====================================================
-- 1. Create Tables
-- =====================================================

CREATE TABLE IF NOT EXISTS departamentos (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT -- Optional, for ISO codes if needed later
);

CREATE TABLE IF NOT EXISTS localidades (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
    UNIQUE(departamento_id, name)
);

-- =====================================================
-- 2. Alter Shipments Table (Strategy A: Snapshot)
-- =====================================================

ALTER TABLE shipments
    ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departamentos(id),
    ADD COLUMN IF NOT EXISTS locality_id INTEGER REFERENCES localidades(id),
    ADD COLUMN IF NOT EXISTS locality_manual TEXT;

-- =====================================================
-- 3. Add Constraints
-- =====================================================

-- Ensure locality belongs to the selected department
-- Note: This is a bit tricky with simple CHECK constraints across tables.
-- Relying on Backend Validation for cross-table integrity or a Function-based check if strictly needed.
-- For now, consistent with user request "Validation strict in backend", we focused on the XOR constraint.

-- XOR Constraint: Either locality_id OR locality_manual (not empty) must be present
-- Only applying this constraint if status is NOT 'draft' (assuming draft exists, logic adapted)
-- Current schema doesn't seem to have 'draft', only 'pendiente'. 
-- User said: "En 'Confirmar/Crear envío': se requiere SIEMPRE".
-- We will apply it generally but allow NULLs if the record is actively being built in a way that allows nulls?
-- Actually user said: "Check constraint constraint que fuerce XOR"


-- 3.1 Backfill existing data to satisfy constraint
-- We populate locality_manual with the existing recipient_city (or a placeholder)
-- so that historical shipments pass the XOR check.
UPDATE shipments
SET locality_manual = CASE 
    WHEN recipient_city IS NOT NULL AND trim(recipient_city) <> '' THEN recipient_city
    ELSE 'Sin localidad especificada'
END
WHERE locality_id IS NULL AND (locality_manual IS NULL OR trim(locality_manual) = '');

-- 3.2 Add Constraint
ALTER TABLE shipments
    ADD CONSTRAINT chk_shipments_locality_xor
    CHECK (
        (locality_id IS NOT NULL) <> (NULLIF(trim(locality_manual), '') IS NOT NULL)
    );

-- =====================================================
-- 4. Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_localities_dept_name ON localidades(departamento_id, name);


-- =====================================================
-- 4. Seed Data
-- =====================================================

DO $$
DECLARE
    d_artigas_id INT;
    d_canelones_id INT;
    d_cerro_largo_id INT;
    d_colonia_id INT;
    d_durazno_id INT;
    d_flores_id INT;
    d_florida_id INT;
    d_lavalleja_id INT;
    d_maldonado_id INT;
    d_montevideo_id INT;
    d_paysandu_id INT;
    d_rio_negro_id INT;
    d_rivera_id INT;
    d_rocha_id INT;
    d_salto_id INT;
    d_san_jose_id INT;
    d_soriano_id INT;
    d_tacuarembo_id INT;
    d_treinta_y_tres_id INT;
BEGIN

    -- Insert Departamentos
    INSERT INTO departamentos (name) VALUES ('ARTIGAS') RETURNING id INTO d_artigas_id;
    INSERT INTO departamentos (name) VALUES ('CANELONES') RETURNING id INTO d_canelones_id;
    INSERT INTO departamentos (name) VALUES ('CERRO LARGO') RETURNING id INTO d_cerro_largo_id;
    INSERT INTO departamentos (name) VALUES ('COLONIA') RETURNING id INTO d_colonia_id;
    INSERT INTO departamentos (name) VALUES ('DURAZNO') RETURNING id INTO d_durazno_id;
    INSERT INTO departamentos (name) VALUES ('FLORES') RETURNING id INTO d_flores_id;
    INSERT INTO departamentos (name) VALUES ('FLORIDA') RETURNING id INTO d_florida_id;
    INSERT INTO departamentos (name) VALUES ('LAVALLEJA') RETURNING id INTO d_lavalleja_id;
    INSERT INTO departamentos (name) VALUES ('MALDONADO') RETURNING id INTO d_maldonado_id;
    INSERT INTO departamentos (name) VALUES ('MONTEVIDEO') RETURNING id INTO d_montevideo_id;
    INSERT INTO departamentos (name) VALUES ('PAYSANDÚ') RETURNING id INTO d_paysandu_id;
    INSERT INTO departamentos (name) VALUES ('RÍO NEGRO') RETURNING id INTO d_rio_negro_id;
    INSERT INTO departamentos (name) VALUES ('RIVERA') RETURNING id INTO d_rivera_id;
    INSERT INTO departamentos (name) VALUES ('ROCHA') RETURNING id INTO d_rocha_id;
    INSERT INTO departamentos (name) VALUES ('SALTO') RETURNING id INTO d_salto_id;
    INSERT INTO departamentos (name) VALUES ('SAN JOSÉ') RETURNING id INTO d_san_jose_id;
    INSERT INTO departamentos (name) VALUES ('SORIANO') RETURNING id INTO d_soriano_id;
    INSERT INTO departamentos (name) VALUES ('TACUAREMBÓ') RETURNING id INTO d_tacuarembo_id;
    INSERT INTO departamentos (name) VALUES ('TREINTA Y TRES') RETURNING id INTO d_treinta_y_tres_id;

    -- Insert Localidades (ARTIGAS)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_artigas_id, 'ARTIGAS'),
    (d_artigas_id, 'BELLA UNIÓN'),
    (d_artigas_id, 'BALTASAR BRUM'),
    (d_artigas_id, 'TOMÁS GOMENSORO'),
    (d_artigas_id, 'PINTADITO'),
    (d_artigas_id, 'SEQUEIRA'),
    (d_artigas_id, 'CUAREIM'),
    (d_artigas_id, 'MONES QUINTELA'),
    (d_artigas_id, 'COLONIA PALMA'),
    (d_artigas_id, 'BERNABÉ RIVERA'),
    (d_artigas_id, 'JAVIER DE VIANA'),
    (d_artigas_id, 'CAINSA'),
    (d_artigas_id, 'CORONADO'),
    (d_artigas_id, 'FRANQUIA');

    -- Insert Localidades (CANELONES)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_canelones_id, 'CANELONES'),
    (d_canelones_id, 'CIUDAD DE LA COSTA'),
    (d_canelones_id, 'LAS PIEDRAS'),
    (d_canelones_id, 'BARROS BLANCOS'),
    (d_canelones_id, 'PANDO'),
    (d_canelones_id, 'LA PAZ'),
    (d_canelones_id, 'SANTA LUCÍA'),
    (d_canelones_id, 'PROGRESO'),
    (d_canelones_id, 'SALINAS'),
    (d_canelones_id, 'PARQUE DEL PLATA'),
    (d_canelones_id, 'ATLÁNTIDA'),
    (d_canelones_id, 'SAUCE'),
    (d_canelones_id, 'TALA'),
    (d_canelones_id, 'SAN RAMÓN'),
    (d_canelones_id, 'SAN JACINTO'),
    (d_canelones_id, 'SAN BAUTISTA'),
    (d_canelones_id, 'SANTA ROSA'),
    (d_canelones_id, 'JOAQUÍN SUÁREZ'),
    (d_canelones_id, 'TOLEDO'),
    (d_canelones_id, 'LOS CERRILLOS'),
    (d_canelones_id, '18 DE MAYO'),
    (d_canelones_id, 'COLONIA NICOLICH'),
    (d_canelones_id, 'EMPALME OLMOS');

    -- Insert Localidades (CERRO LARGO)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_cerro_largo_id, 'MELO'),
    (d_cerro_largo_id, 'RÍO BRANCO'),
    (d_cerro_largo_id, 'FRAILE MUERTO'),
    (d_cerro_largo_id, 'ISIDORO NOBLÍA'),
    (d_cerro_largo_id, 'ACEGUÁ'),
    (d_cerro_largo_id, 'TUPAMBAÉ'),
    (d_cerro_largo_id, 'PLÁCIDO ROSAS'),
    (d_cerro_largo_id, 'ARÉVALO'),
    (d_cerro_largo_id, 'RAMÓN TRIGO'),
    (d_cerro_largo_id, 'LAGO MERÍN'),
    (d_cerro_largo_id, 'CERRO DE LAS CUENTAS'),
    (d_cerro_largo_id, 'BAÑADO DE MEDINA');

    -- Insert Localidades (COLONIA)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_colonia_id, 'COLONIA DEL SACRAMENTO'),
    (d_colonia_id, 'CARMELO'),
    (d_colonia_id, 'JUAN LACAZE'),
    (d_colonia_id, 'NUEVA HELVECIA'),
    (d_colonia_id, 'NUEVA PALMIRA'),
    (d_colonia_id, 'ROSARIO'),
    (d_colonia_id, 'TARARIRAS'),
    (d_colonia_id, 'COLONIA VALDENSE'),
    (d_colonia_id, 'FLORENCIO SÁNCHEZ'),
    (d_colonia_id, 'OMBÚES DE LAVALLE'),
    (d_colonia_id, 'MIGUELETE'),
    (d_colonia_id, 'LA PAZ'),
    (d_colonia_id, 'CONCHILLAS'),
    (d_colonia_id, 'SANTA ANA'),
    (d_colonia_id, 'CUFRÉ');

    -- Insert Localidades (DURAZNO)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_durazno_id, 'DURAZNO'),
    (d_durazno_id, 'SARANDÍ DEL YÍ'),
    (d_durazno_id, 'VILLA DEL CARMEN'),
    (d_durazno_id, 'CENTENARIO'),
    (d_durazno_id, 'CERRO CHATO'),
    (d_durazno_id, 'LA PALOMA'),
    (d_durazno_id, 'BLANQUILLO'),
    (d_durazno_id, 'CARLOS REYLES'),
    (d_durazno_id, 'SAN JORGE'),
    (d_durazno_id, 'BAYGORRIA');

    -- Insert Localidades (FLORES)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_flores_id, 'TRINIDAD'),
    (d_flores_id, 'ISMAEL CORTINAS'),
    (d_flores_id, 'ANDRESITO'),
    (d_flores_id, 'LA CASILLA'),
    (d_flores_id, 'JUAN JOSÉ CASTRO'),
    (d_flores_id, 'CERRO COLORADO');

    -- Insert Localidades (FLORIDA)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_florida_id, 'FLORIDA'),
    (d_florida_id, 'SARANDÍ GRANDE'),
    (d_florida_id, 'CASUPÁ'),
    (d_florida_id, 'FRAY MARCOS'),
    (d_florida_id, '25 DE MAYO'),
    (d_florida_id, '25 DE AGOSTO'),
    (d_florida_id, 'CARDAL'),
    (d_florida_id, 'ALEJANDRO GALLINAL'),
    (d_florida_id, 'NICO PÉREZ'),
    (d_florida_id, 'MENDOZA CHICO'),
    (d_florida_id, 'MENDOZA'),
    (d_florida_id, 'CAPILLA DEL SAUCE');

    -- Insert Localidades (LAVALLEJA)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_lavalleja_id, 'MINAS'),
    (d_lavalleja_id, 'JOSÉ PEDRO VARELA'),
    (d_lavalleja_id, 'SOLÍS DE MATAOJO'),
    (d_lavalleja_id, 'JOSÉ BATLLE Y ORDÓÑEZ'),
    (d_lavalleja_id, 'MARISCALA'),
    (d_lavalleja_id, 'PIRARAJÁ'),
    (d_lavalleja_id, 'ZAPICÁN'),
    (d_lavalleja_id, 'VILLA SERRANA'),
    (d_lavalleja_id, 'BLANES VIALE'),
    (d_lavalleja_id, 'COLÓN');

    -- Insert Localidades (MALDONADO)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_maldonado_id, 'MALDONADO'),
    (d_maldonado_id, 'PUNTA DEL ESTE'),
    (d_maldonado_id, 'SAN CARLOS'),
    (d_maldonado_id, 'PIRIÁPOLIS'),
    (d_maldonado_id, 'PAN DE AZÚCAR'),
    (d_maldonado_id, 'AIGUÁ'),
    (d_maldonado_id, 'GARZÓN'),
    (d_maldonado_id, 'SOLÍS GRANDE');

    -- Insert Localidades (MONTEVIDEO)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_montevideo_id, 'MONTEVIDEO'),
    (d_montevideo_id, 'SANTIAGO VÁZQUEZ'),
    (d_montevideo_id, 'ABAYUBÁ'),
    (d_montevideo_id, 'PAJAS BLANCAS');

    -- Insert Localidades (PAYSANDÚ)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_paysandu_id, 'PAYSANDÚ'),
    (d_paysandu_id, 'NUEVO PAYSANDÚ'),
    (d_paysandu_id, 'CHACRAS DE PAYSANDÚ'),
    (d_paysandu_id, 'GUICHÓN'),
    (d_paysandu_id, 'QUEBRACHO'),
    (d_paysandu_id, 'SAN FÉLIX'),
    (d_paysandu_id, 'PIEDRAS COLORADAS'),
    (d_paysandu_id, 'PORVENIR'),
    (d_paysandu_id, 'TAMBORES'),
    (d_paysandu_id, 'CHAPICUY'),
    (d_paysandu_id, 'LORENZO GEYRES');

    -- Insert Localidades (RÍO NEGRO)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_rio_negro_id, 'FRAY BENTOS'),
    (d_rio_negro_id, 'YOUNG'),
    (d_rio_negro_id, 'NUEVO BERLÍN'),
    (d_rio_negro_id, 'SAN JAVIER'),
    (d_rio_negro_id, 'ALGORTA'),
    (d_rio_negro_id, 'BARRIO ANGLO'),
    (d_rio_negro_id, 'GRECCO'),
    (d_rio_negro_id, 'LOS ARRAYANES'),
    (d_rio_negro_id, 'PASO DE LOS MELLIZOS'),
    (d_rio_negro_id, 'VILLA MARÍA');

    -- Insert Localidades (RIVERA)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_rivera_id, 'RIVERA'),
    (d_rivera_id, 'TRANQUERAS'),
    (d_rivera_id, 'VICHADERO'),
    (d_rivera_id, 'MINAS DE CORRALES'),
    (d_rivera_id, 'PASO ATAQUES'),
    (d_rivera_id, 'LAGOS DEL NORTE'),
    (d_rivera_id, 'MASOLLER'),
    (d_rivera_id, 'LAPUENTE'),
    (d_rivera_id, 'PASO HOSPITAL'),
    (d_rivera_id, 'CERRILLADA');

    -- Insert Localidades (ROCHA)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_rocha_id, 'ROCHA'),
    (d_rocha_id, 'CHUY'),
    (d_rocha_id, 'CASTILLOS'),
    (d_rocha_id, 'LASCANO'),
    (d_rocha_id, 'LA PALOMA'),
    (d_rocha_id, 'PUNTA DEL DIABLO'),
    (d_rocha_id, 'CEBOLLATÍ'),
    (d_rocha_id, '18 DE JULIO'),
    (d_rocha_id, 'VELÁZQUEZ'),
    (d_rocha_id, 'LA CORONILLA'),
    (d_rocha_id, 'BARRA DE VALIZAS'),
    (d_rocha_id, 'CABO POLONIO');

    -- Insert Localidades (SALTO)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_salto_id, 'SALTO'),
    (d_salto_id, 'CONSTITUCIÓN'),
    (d_salto_id, 'BELÉN'),
    (d_salto_id, 'SAN ANTONIO'),
    (d_salto_id, 'COLONIA LAVALLEJA'),
    (d_salto_id, 'RINCÓN DE VALENTÍN'),
    (d_salto_id, 'TERMAS DEL DAYMÁN'),
    (d_salto_id, 'TERMAS DEL ARAPEY'),
    (d_salto_id, 'MIGLIARO'),
    (d_salto_id, 'ARENITAS BLANCAS');

    -- Insert Localidades (SAN JOSÉ)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_san_jose_id, 'SAN JOSÉ DE MAYO'),
    (d_san_jose_id, 'CIUDAD DEL PLATA'),
    (d_san_jose_id, 'LIBERTAD'),
    (d_san_jose_id, 'ECILDA PAULLIER'),
    (d_san_jose_id, 'RODRÍGUEZ'),
    (d_san_jose_id, 'PUNTAS DE VALDEZ'),
    (d_san_jose_id, 'RAFAEL PERAZZA'),
    (d_san_jose_id, 'JUAN SOLER'),
    (d_san_jose_id, 'KIYÚ ORDEIG'),
    (d_san_jose_id, 'ITUZAINGÓ'),
    (d_san_jose_id, 'CAPURRO'),
    (d_san_jose_id, 'MAL ABRIGO');

    -- Insert Localidades (SORIANO)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_soriano_id, 'MERCEDES'),
    (d_soriano_id, 'DOLORES'),
    (d_soriano_id, 'CARDONA'),
    (d_soriano_id, 'PALMITAS'),
    (d_soriano_id, 'JOSÉ ENRIQUE RODÓ'),
    (d_soriano_id, 'CHACRAS DE DOLORES'),
    (d_soriano_id, 'VILLA SORIANO'),
    (d_soriano_id, 'SANTA CATALINA'),
    (d_soriano_id, 'EGAÑA'),
    (d_soriano_id, 'RISSO');

    -- Insert Localidades (TACUAREMBÓ)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_tacuarembo_id, 'TACUAREMBÓ'),
    (d_tacuarembo_id, 'PASO DE LOS TOROS'),
    (d_tacuarembo_id, 'SAN GREGORIO DE POLANCO'),
    (d_tacuarembo_id, 'ANSINA'),
    (d_tacuarembo_id, 'LAS TOSCAS'),
    (d_tacuarembo_id, 'CURTINA'),
    (d_tacuarembo_id, 'ACHAR'),
    (d_tacuarembo_id, 'TAMBORES'),
    (d_tacuarembo_id, 'PASO BONILLA'),
    (d_tacuarembo_id, 'CRUZ DE LOS CAMINOS');

    -- Insert Localidades (TREINTA Y TRES)
    INSERT INTO localidades (departamento_id, name) VALUES
    (d_treinta_y_tres_id, 'TREINTA Y TRES'),
    (d_treinta_y_tres_id, 'VERGARA'),
    (d_treinta_y_tres_id, 'SANTA CLARA DE OLIMAR'),
    (d_treinta_y_tres_id, 'GRAL. ENRIQUE MARTÍNEZ'),
    (d_treinta_y_tres_id, 'CERRO CHATO'),
    (d_treinta_y_tres_id, 'VILLA SARA'),
    (d_treinta_y_tres_id, 'RINCÓN'),
    (d_treinta_y_tres_id, 'ESTACIÓN RINCÓN'),
    (d_treinta_y_tres_id, 'EJIDO DE TREINTA Y TRES');

END $$;
