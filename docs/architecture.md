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
│ hooks/useExamWorkflow + hooks/useReportes + utils/examUtils               │
└───────┬─────────────────────────────┬───────────────────────────┬──────────┘
        │                             │                           │
        ▼                             ▼                           ▼
┌───────────────┐              ┌───────────────┐           ┌───────────────┐
│Servicios ext. │              │Persistencia   │           │Exportación    │
│ocrService     │              │storageService │           │exportService  │
│               │              │+sessionService│           │               │
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
│ Resiliencia: fallback + reintentos + circuit breaker por proveedor         │
└────────────────────────────────────────────────────────────────────────────┘
```

## Flujo de datos OCR enriquecido

1. `StepIngresoRespuestas` invoca `procesarImagenOCR` de `src/services/ocrService.js`.
2. Tesseract devuelve `text` y, cuando están disponibles, metadatos `lines[]` o `words[]` con `confidence`.
3. `parsearOCRPorNumeroPregunta` (en `src/utils/examUtils.js`) aplica parsing tolerante a ruido (ej.: `1) A`, `P1-A`, `01.A`, y caracteres confusos `4/8/0/O`).
4. El frontend conserva una estructura enriquecida por pregunta: `{ respuesta, confianza, fuenteLinea }`.
5. `StepIngresoRespuestas` y `StepRevision` resaltan filas con baja confianza para revisión docente.

### Contrato OCR interno

- `ocrService.procesarImagenOCR(...)` retorna:
  - `textoDetectado: string`
  - `respuestasParseadas: Array<{ respuesta: string, confianza: number | null, fuenteLinea: string }>`
- Umbral de baja confianza en UI: `< 65` (porcentaje OCR).

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

## Flujo de persistencia de reportes

1. `App.jsx` construye el objeto `reporte` final.
2. `useReportes.guardarReporte` intenta guardar mediante `storageService.guardarReporteApi`.
3. `backend/server.js` recibe `POST /api/reportes` y valida payload mínimo.
4. `reportRepository` crea o actualiza el reporte en `reports`.
5. El backend registra `report_created` o `report_updated` en `audit_logs` con actor técnico y timestamp.
6. El frontend refresca estado local en memoria.
7. Solo si el backend no está disponible, `useReportes` activa fallback controlado con `localStorage`.

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
