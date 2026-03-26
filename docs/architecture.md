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
│(Tesseract.js) │              │(localStorage) │           │(jsPDF + CSV)  │
└──────┬────────┘              └──────┬────────┘           └──────┬────────┘
       │                               │                           │
       ▼                               ▼                           ▼
┌───────────────┐              ┌───────────────┐           ┌───────────────┐
│aiService      │              │Navegador      │           │Descargas      │
│/api/... local │              │almacenamiento │           │.pdf / .csv    │
└──────┬────────┘              └───────────────┘           └───────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Backend Node (backend/server.js)                                          │
│ POST /api/calificacion/sugerir -> Anthropic Messages API                  │
│ Variables: ANTHROPIC_API_KEY, ANTHROPIC_MODEL, PORT                       │
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

## Flujo de datos de IA

1. `StepRevision` dispara `sugerirCalificacionConIA`.
2. `src/services/aiService.js` llama `POST /api/calificacion/sugerir`.
3. `backend/server.js` valida payload (`datos`, `puntaje`) y construye prompt.
4. El backend consulta `https://api.anthropic.com/v1/messages` con `x-api-key` desde entorno.
5. El frontend parsea la respuesta JSON y autocompleta la decisión final editable.

## Contratos de entrada/salida

### Frontend: `services/aiService.js`

#### `sugerirCalificacionIA({ datos, puntaje })`
- **Entrada**
  - `datos: { materia, grupo, fecha, totalPreguntas, ... }`
  - `puntaje: number` (0–100)
- **Salida**
  - `{ puntuacion: string, justificacion: string }`
- **Errores**
  - Timeout 20s.
  - Error HTTP del backend.
  - JSON de IA sin `puntuacion_sugerida` válida.

### Backend: `POST /api/calificacion/sugerir`
- **Entrada**
  - JSON `{ datos: object, puntaje: number }`
- **Salida éxito**
  - Payload de Anthropic (`content[]`, etc.).
- **Errores**
  - `400` payload inválido.
  - `500` secreto faltante.
  - `502` error de red/proveedor.
  - `504` timeout hacia Anthropic.

## Ejecución local

1. Iniciar backend:
   - `ANTHROPIC_API_KEY=... npm run dev:api`
2. Iniciar frontend en otro proceso:
   - `npm run dev`
3. Vite enruta `/api/*` a `http://localhost:8787` mediante proxy.

## ADRs relacionadas

- [ADR 0001: OCR en cliente con Tesseract](adr/0001-ocr-en-cliente-con-tesseract.md)
- [ADR 0002: Integración IA desde frontend](adr/0002-integracion-ia-desde-frontend.md)
- [ADR 0003: Persistencia en localStorage](adr/0003-persistencia-localstorage.md)
- [ADR 0004: Exportación PDF/CSV en cliente](adr/0004-exportacion-pdf-csv-en-cliente.md)
- [ADR 0005: Migración IA a backend y custodia de secretos](adr/0005-migracion-ia-a-backend.md)
