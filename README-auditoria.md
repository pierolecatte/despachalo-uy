# Sistema de Auditoría (v2) - Despachalo.uy

Sistema integral de auditoría y gestión de evidencia para el ciclo de vida de los envíos.

## Características Principales

### 1. Panel de Auditoría (`/admin/auditoria`)
Una interfaz dedicada para visualizar y analizar el historial de cambios.
-   **Vista Global (Super Admin)**: Acceso completo a todos los registros del sistema.
-   **Vista Organización (Org Admin)**: Acceso restringido a eventos generados por su organización o que afectan a sus datos.
-   **Detalle de Cambios**: Visualizador de diferencias (Diff Viewer) para ver el "antes y después" de cada registro JSON.
-   **Identificación de Actores**: Distinción clara entre usuarios humanos y acciones del sistema (cron/webhooks).

### 2. Timeline de Envíos (Domain Events)
Visible en el detalle de cada envío (`/admin/shipments/[id]`).
-   Historial amigable de operaciones clave: Creación, Cambios de Estado, Edición de datos sensibles, Archivos adjuntos.
-   Muestra el Actor real (Nombre + Rol) que ejecutó la acción.

### 3. Gestión de Archivos (`shipment_files`)
-   Sistema robusto de adjuntos con trazabilidad.
-   Categorías: Etiqueta, Comprobante, Documentos Adicionales.
-   Cada subida/borrado genera eventos de auditoría.

## Arquitectura Técnica

### Base de Datos
-   **Schema `audit`**: Contiene la tabla particionada/indexada `log`.
-   **Triggers**:
    -   `audit.log_row()`: Captura INSERT/UPDATE/DELETE en tablas críticas (`shipments`, `users`, `organizations`, `shipment_files`).
    -   Automáticamente calcula el `diff` JSONB.
    -   Redacta campos sensibles (password, tokens).
    -   Resuelve el `target_org_id` para RLS.
-   **RLS (Row Level Security)**:
    -   Políticas estrictas en `audit.log` que garantizan el aislamiento de datos entre organizaciones.

### Identidad y Seguridad
-   **Actor Resolution**:
    -   Prioriza `auth.uid()` para usuarios logueados.
    -   Soporta `app.actor_auth_uid` o `actor_type='system'` para procesos background.
-   **Niveles de Acceso**:
    -   `super_admin`: Ve todo.
    -   `org_admin`: Ve solo lo relacionado a su `org_id`.

## Instrucciones de Migración y Verificación

### 1. Aplicar Migraciones (Manual)
Debido a restricciones de permisos locales, ejecute los siguientes scripts en el **SQL Editor de Supabase Dashboard**:

1.  **Reset (Opcional pero recomendado)**:
    ```sql
    DROP SCHEMA IF EXISTS audit CASCADE;
    ```
2.  **Core System**: Contenido de `supabase/migrations/005_audit_system.sql`.
3.  **Panel & Policies**: Contenido de `supabase/migrations/006_audit_panel.sql`.

### 2. Verificación Manual

#### A. Verificación de Eventos y Archivos
1.  Loguearse como Admin.
2.  Ir a un envío existente o crear uno.
3.  **Subir un archivo**: Verificar que aparece en la UI y en "Historial de eventos".
4.  **Cambiar estado**: Cambiar a "En Camino". Verificar evento "Estado cambiado a En Camino — por [Tu Nombre]".

#### B. Verificación del Panel de Auditoría
1.  Ir a `/admin/auditoria`.
2.  Si eres Super Admin, verás la pestaña "Vista Global".
3.  Busca la acción reciente (ej. UPDATE en `shipments`).
4.  Click en "Ver" -> Confirmar que el Modal muestra el JSON Diff correcto (ej. `status: "pending" -> "in_transit"`).

#### C. Verificación de Seguridad (RLS)
1.  Loguearse como un usuario `org_admin` de una organización específica (ej. Cadetería A).
2.  Ir a `/admin/auditoria`.
3.  Verificar que **NO** se vean registros de otras organizaciones (ej. Cadetería B o Remitentes ajenos).
