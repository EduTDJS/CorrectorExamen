# Arquitectura del sistema

## Objetivo del sistema

CalificaYa permite **configurar, corregir y reportar exámenes de selección múltiple** con soporte de OCR e IA para sugerencia docente.

## Nomenclatura del producto

- La marca visible del producto en UI y documentación es **CalificaYa**.
- Referencias históricas a **CorrectorExamen** pueden aparecer en ADR antiguos o artefactos previos; no implican un cambio de arquitectura ni de contrato técnico.

## Diagrama lógico de módulos

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ UI (React + Vite)                                                          │
│ App.jsx + pasos de workflow + panel de reportes                            │
└───────────────┬────────────────────────────────────────────────────────────┘
                │ eventos/estado
                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Dominio / Flujo                                                            │
│ hooks/useExamWorkflow + hooks/useReportes + utils/examUtils + rúbricas    │
└───────┬─────────────────────────────┬───────────────────────────┬──────────┘
        │                             │                           │
        ▼                             ▼                           ▼
┌───────────────┐              ┌───────────────┐           ┌───────────────┐
│Servicios ext. │              │Persistencia   │           │Exportación    │
│ocrService     │              │storageService │           │exportService  │
│importService  │              │+sessionService│           │               │
│               │              │               │           │               │
│(Tesseract.js) │              │(API primario +│           │(jsPDF + CSV)  │
│               │              │fallback local │           │               │
│               │              │controlado)    │           │               │
└──────┬────────┘              └──────┬────────┘           └──────┬────────┘
       │                               │                           │
       ▼                               ▼                           ▼
┌───────────────┐              ┌───────────────┐           ┌───────────────┐
│aiService      │              │Backend DB     │           │Descargas      │
│/api/... local │              │reports/audit  │           │.pdf / .csv    │
└──────┬────────┘              └───────────────┘           └───────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Backend Node (backend/server.js)                                          │
│ POST /api/calificacion/sugerir -> providerOrchestrator (primario/sec.)    │
│ POST /api/reportes + GET /api/reportes + GET /api/reportes/:id            │
│ GET/POST /api/rubricas -> rubricRepository (SQLite durable + versionado)  │
│ GET /api/reportes/:id/versiones (+ /:version)                             │
│ Resiliencia: fallback + reintentos + circuit breaker por proveedor         │
└────────────────────────────────────────────────────────────────────────────┘
```


## Módulos críticos (quality gate)

Los siguientes módulos se consideran críticos para la operación y deben mantener cobertura mínima por archivo de **80%** en `statements`, `functions` y `lines` (y al menos el umbral global vigente en `branches`):

- `backend/server.js`
- `backend/ai/providerOrchestrator.js`
- `src/hooks/useReportes.js`
- `src/services/aiService.js`

> Regla de enforcement: `npm run test:ci` (Vitest con cobertura) falla si cualquiera de estos módulos queda por debajo de ese umbral, además de respetar los umbrales globales del proyecto.

## Flujo de datos OCR enriquecido

1. `StepIngresoRespuestas` invoca `procesarImagenOCR` de `src/services/ocrService.js`.
2. Tesseract devuelve `text` y, cuando están disponibles, metadatos `lines[]` o `words[]` con `confidence`.
3. `parsearOCRPorNumeroPregunta` (en `src/utils/examUtils.js`) aplica parsing tolerante a ruido (ej.: `1) A`, `P1-A`, `01.A`, y caracteres confusos `4/8/0/O`).
4. El frontend conserva una estructura enriquecida por pregunta: `{ respuesta, confianza, fuenteLinea }`.
5. `StepIngresoRespuestas` y `StepRevision` resaltan filas con baja confianza para revisión docente.

## Flujo de plantillas de rúbrica y scoring

1. `useExamWorkflow` carga plantillas desde `GET /api/rubricas` y usa semillas locales como fallback.
2. `StepConfiguracion` muestra un selector de plantilla (`materia`, `grado`, `version`) para precargar criterios.
3. Al seleccionar plantilla, `App.jsx` autocompleta `materia`, `totalPreguntas` y `claveRespuestas` usando `criterios[]`.
4. El cálculo de puntaje usa `src/utils/rubricScoring.js`, que aplica pesos por criterio y reglas de penalización/bonificación.
5. `StepRevision` permite override manual docente por pregunta; el ajuste se refleja en el puntaje y justificación final.
6. `rubricRepository` persiste en SQLite (`rubrics` + `rubric_versions`) y al editar crea una versión incremental (`n+1`) manteniendo historial por rúbrica.
7. `GET /api/rubricas` permite filtrar por `materia`, `grado`, `version` y controlar si retorna solo versión vigente (`vigente=true`, default) o historial (`historial=true`).

### Contrato OCR interno

- `ocrService.procesarImagenOCR(...)` retorna:
  - `textoDetectado: string`
  - `respuestasParseadas: Array<{ respuesta: string, confianza: number | null, fuenteLinea: string }>`
- Umbral de baja confianza en UI: `< 65` (porcentaje OCR).

## Prueba E2E crítica del roadmap (flujo mínimo estable)

- Archivo: `e2e/roadmap-critical-flow.spec.js`.
- Fixtures determinísticas: `e2e/fixtures/mockData.js`.
- Cobertura del caso: configuración de examen, importación por archivo, revisión/corrección con IA mock, persistencia en backend (`POST /api/reportes`) y exportación (`GET /api/reportes/:id/export`).
- Evidencia en CI: artefacto `e2e-critical-flow-evidence` (traces/videos/resultados de Playwright) además de `playwright-report`.

## Trazabilidad de evidencia hacia roadmap

Para mantener consistencia con `docs/improvements-roadmap.md` (checklist final), la evidencia arquitectónica verificable se concentra en:

- **Flujo transaccional backend-first**: sección "Flujo de persistencia de reportes (transaccional end-to-end)" de este documento.
- **Cobertura y quality gate**: sección "Módulos críticos (quality gate)" + script `npm run test:ci`.
- **Prueba E2E crítica**: `e2e/roadmap-critical-flow.spec.js`, `e2e/fixtures/mockData.js` y artefacto CI `e2e-critical-flow-evidence` en `.github/workflows/ci.yml`.
- **Observabilidad operativa**: endpoints `GET /api/metrics` y `GET /metrics` documentados en `docs/observability.md`.
- **Dashboard externo del roadmap**: publicado y activo. Referencia oficial: `https://monitoring.calificaya.com/d/flujo-sugerencia-operativo` (panel `CalificaYa · Sugerencia IA (p95 + error rate)`, última verificación `2026-04-04`, responsable `María Fernanda López (SRE)`, owner `Platform & SRE`, target_date `2026-04-15`, status `activo`), en espejo con `docs/observability.md`.

## Flujo de importación masiva (CSV/Excel)

1. `StepIngresoRespuestas` permite cargar archivo de importación (`.csv`, `.xls`, `.xlsx` en SpreadsheetML).
2. `src/services/importService.js` enruta parsing por extensión: CSV nativo, `.xlsx` (OpenXML) y `.xls` (SpreadsheetML/XML 2003), reutilizando un contrato único.
3. El servicio valida límites (`2MB`, `<=200` filas), normaliza encabezados/alias y aplica `REQUIRED_FIELDS + validarSchema` por fila.
4. El servicio normaliza respuestas con las mismas reglas de `examUtils` (`A/B/C/D` + equivalencias OCR).
5. Los errores se devuelven por registro (`fila`, `matricula`, `errores[]`) para mostrarse en UI.
6. Si una matrícula aparece duplicada dentro del archivo, se conserva la última fila válida.
7. `App.jsx` cruza matrículas importadas contra `useReportes` para advertir duplicados ya existentes en historial.
8. El docente puede cargar cualquier fila válida al formulario y editarla manualmente antes de seguir con revisión/guardado.

## Flujo de sesión y autorización

1. La sesión del usuario en frontend se concentra en `src/services/sessionService.js`.
2. `buildAuthHeaders` reutiliza esa sesión para adjuntar `Authorization: Bearer <token>` en servicios de IA y reportes.
3. `aiService` protege `POST /api/calificacion/sugerir`; `storageService` protege `GET/POST /api/reportes`, `GET /api/reportes/:id` y `GET /api/reportes/:id/export`.
4. `backend/server.js` aplica autenticación (`401`) y autorización RBAC (`403`) por acción.
5. La UI traduce `401/403` en mensajes explícitos para sesión expirada o permisos insuficientes.

## Flujo de datos de IA

1. `StepRevision` dispara `sugerirCalificacionConIA`.
2. `src/services/aiService.js` llama `POST /api/calificacion/sugerir`.
3. `backend/server.js` valida payload (`datos`, `puntaje`) y delega en `backend/ai/providerOrchestrator.js`.
4. El orquestador intenta proveedor primario (`AI_PROVIDER`) y puede conmutar a secundario (`AI_PROVIDER_SECONDARY`) según política.
5. Cada proveedor tiene circuito propio (`closed`/`open`/`half_open`) con umbral y ventana temporal configurable.
6. El backend retorna un contrato normalizado estable y reporta eventos de failover/circuito en logs estructurados.
7. El frontend usa ese contrato para autocompletar la decisión final editable.

## Flujo de persistencia de reportes (transaccional end-to-end)

1. `App.jsx` construye el objeto `reporte` final.
2. `useReportes.guardarReporte` intenta persistir vía `storageService.guardarReporteApi`.
3. `backend/server.js` recibe `POST /api/reportes`, valida contrato mínimo y resuelve contexto de actor/tenant.
4. `reportRepository` transforma el payload a modelo normalizado (`schools`, `groups`, `exams`, `students`, `submissions`, `grades`) y mantiene snapshot `reports` para compatibilidad.
5. `database` ejecuta una sola transacción SQL (`BEGIN IMMEDIATE ... COMMIT`) con orden: upsert entidades núcleo -> upsert `reports` -> inserción en `audit_logs`.
6. En la misma transacción, se inserta snapshot versionado en `report_versions` con `version_number` incremental por `report_id`.
7. En lectura, `GET /api/reportes/:id/versiones` y `GET /api/reportes/:id/versiones/:version` exponen historial de versiones sin romper el aislamiento tenant/usuario, y ambos responden con envoltura consistente `{ data: ... }`.
8. Si hay error, se aplica `ROLLBACK` y la API no expone estado parcial.
9. En lectura (`GET /api/reportes`, `GET /api/reportes/:id`), el backend prioriza datos normalizados y usa `payload_json` como respaldo de compatibilidad.
10. El frontend refresca estado local en memoria; solo si backend no está disponible, `useReportes` activa fallback controlado en `localStorage`.

### Política de persistencia frontend (backend-first)

- La persistencia **primaria** de reportes es backend (`GET/POST /api/reportes`).
- `localStorage` se usa únicamente como fallback controlado (offline/desarrollo o caída de backend).
- Cuando el backend responde correctamente, el estado de reportes se hidrata **exclusivamente** desde API y no desde `localStorage`.
- La escritura a `localStorage` solo ocurre cuando `useReportes` detecta explícitamente `usaBackend === false`.

## Contratos de entrada/salida

### Frontend: `services/aiService.js`

#### `sugerirCalificacionIA({ datos, puntaje })`
- **Entrada**
  - `datos: { materia, grupo, fecha, totalPreguntas, ... }`
  - `puntaje: number` (0–100)
- **Salida**
  - `{ puntuacion: string, justificacion: string, proveedor: string, modelo: string }`
- **Errores**
  - Timeout 20s.
  - Error HTTP del backend.
  - Respuesta IA mal formada o contrato inválido.

### Backend: `POST /api/calificacion/sugerir`
- **Entrada**
  - JSON `{ datos: object, puntaje: number }`
- **Salida éxito (contrato normalizado)**
  - `puntuacion: string` (dos decimales, `0.00`–`100.00`)
  - `justificacion: string`
  - `proveedor: "anthropic" | "openai"`
  - `modelo: string`
- **Errores**
  - `400` payload inválido (`payload_validation_error`).
  - `500` configuración inválida o secretos faltantes (`provider_config_error`).
  - `502` error de proveedor (`provider_upstream_error`/`provider_contract_error`/`provider_circuit_open`).
  - `504` timeout hacia proveedor (`provider_timeout`).

### Variables de entorno de resiliencia IA

- `AI_PROVIDER`: proveedor primario (`anthropic` | `openai`).
- `AI_PROVIDER_SECONDARY`: proveedor secundario opcional para failover.
- `AI_FALLBACK_ENABLED`: habilita conmutación (`true` por defecto).
- `AI_FALLBACK_RETRIES`: reintentos sobre proveedor primario antes de conmutar (default `1`).
- `AI_FALLBACK_ERROR_CODES`: lista CSV de códigos que habilitan fallback (default: `provider_timeout,provider_upstream_error`).
- `AI_CIRCUIT_FAILURE_THRESHOLD`: cantidad de fallos para abrir circuito (default `3`).
- `AI_CIRCUIT_OPEN_MS`: ventana en ms de circuito abierto antes de pasar a medio-abierto (default `30000`).

## Ejecución local

1. Iniciar backend:
   - `AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... npm run dev:api`
2. Iniciar frontend en otro proceso:
   - `npm run dev`
3. Vite enruta `/api/*` a `http://localhost:8787` mediante proxy.

Ejemplo con OpenAI:

- `AI_PROVIDER=openai OPENAI_API_KEY=... OPENAI_MODEL=gpt-4o-mini npm run dev:api`

## ADRs relacionadas

- [ADR 0001: OCR en cliente con Tesseract](adr/0001-ocr-en-cliente-con-tesseract.md)
- [ADR 0002: Integración IA desde frontend](adr/0002-integracion-ia-desde-frontend.md)
- [ADR 0003: Persistencia en localStorage](adr/0003-persistencia-localstorage.md)
- [ADR 0004: Exportación PDF/CSV en cliente](adr/0004-exportacion-pdf-csv-en-cliente.md)
- [ADR 0005: Migración IA a backend y custodia de secretos](adr/0005-migracion-ia-a-backend.md)
- [ADR 0006: Selección de proveedor IA por variable de entorno y contrato normalizado](adr/0006-ai-provider-env-y-contrato-normalizado.md)
- [ADR 0007: Persistencia de reportes en backend con auditoría](adr/0007-persistencia-reportes-en-backend-con-auditoria.md)
- [ADR 0009: Estrategia de resiliencia IA (fallback + circuit breaker)](adr/0009-resiliencia-ia-orquestador-fallback-circuit-breaker.md)
- [ADR 0014: Módulo de rúbricas versionadas para plantillas y scoring docente](adr/0014-modulo-rubricas-versionadas.md)
