# Asignación de Cadete por Envío + Escaneo

## Resumen

Sistema de asignación de cadetes a envíos con doble validación (DB + API):
- Un cadete solo puede ser asignado a envíos cuya `cadeteria_org_id` coincide con su `org_id`.
- Los cadetes escanean envíos vía un endpoint server-side que controla la lógica de reasignación.

## Migración SQL

Ejecutar en Supabase SQL Editor (Dashboard > SQL):

```sql
-- Copiar contenido de: supabase/migrations/004_cadete_assignment.sql
```

Esto crea:
- `envio_asignaciones_log` — Auditoría de asignaciones
- `envio_scans_log` — Log de escaneos
- Trigger `trg_validate_cadete_cadeteria` — Validación DB
- RPC `cadete_scan_envio(p_tracking_code)` — Escaneo atómico

## Endpoints

### `POST /api/envios/:id/asignar-cadete`

Asignación manual (solo admin/org_admin).

```bash
curl -X POST http://localhost:3000/api/envios/<ENVIO_ID>/asignar-cadete \
  -H "Content-Type: application/json" \
  -H "Cookie: <SESSION_COOKIE>" \
  -d '{"cadete_id": "<CADETE_USER_ID>"}'
```

**Respuesta exitosa:**
```json
{ "status": "ok", "message": "Cadete asignado correctamente", "envioId": "...", "cadeteId": "..." }
```

**Error cadetería diferente:**
```json
{ "status": "error", "message": "El cadete no pertenece a la cadetería asignada al envío" }
```

### `POST /api/cadete/scan`

Escaneo de envío (solo rol cadete).

```bash
curl -X POST http://localhost:3000/api/cadete/scan \
  -H "Content-Type: application/json" \
  -H "Cookie: <SESSION_COOKIE>" \
  -d '{"codigo": "DUY-XXXXXXXX"}'
```

**Posibles respuestas (`status`):**

| status | message | reassigned |
|--------|---------|------------|
| `asignado` | Envío asignado correctamente | `false` |
| `reasignado` | Envío reasignado a tu nombre | `true` |
| `confirmado` | Envío ya asignado a tu nombre | `false` |
| `other_cadeteria` | Envío asignado a otra cadetería | `false` |
| `not_found` | Código inválido o envío inexistente | `false` |

## Tests

```bash
# Instalar dependencias (si no están)
npm install

# Correr tests
npx vitest run src/__tests__/asignar-cadete.test.ts
```

Los 11 tests cubren:
1. ✅ Asignar cadete correcto OK
2. ✅ Asignar cadete de otra cadetería → error
3. ✅ Scan envío inexistente → `not_found`
4. ✅ Scan envío de otra cadetería → mensaje exacto "Envío asignado a otra cadetería"
5. ✅ Scan mismo cadetería, otro cadete → reasignación OK (`reassigned: true`)
6. ✅ Casos adicionales (cadete inactivo, rol incorrecto, confirmación, etc.)

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `supabase/migrations/004_cadete_assignment.sql` | Migración completa |
| `src/types/database.ts` | Tipos actualizados |
| `src/app/api/envios/[id]/asignar-cadete/route.ts` | Endpoint asignación |
| `src/app/api/cadete/scan/route.ts` | Endpoint escaneo |
| `src/__tests__/asignar-cadete.test.ts` | Tests unitarios |
