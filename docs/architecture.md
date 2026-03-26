# Arquitectura del sistema

## Objetivo del sistema

CorrectorExamen es una aplicación frontend orientada a **configurar, corregir y reportar exámenes de selección múltiple**. El objetivo operativo es:

1. Capturar la configuración académica del examen.
2. Recibir respuestas del estudiante por transcripción manual o por OCR de imagen.
3. Calcular un puntaje automático por pregunta y puntaje total sobre 100.
4. Solicitar una sugerencia de puntuación/justificación a IA (Anthropic) como apoyo docente.
5. Consolidar una decisión final de calificación.
6. Exportar reportes individuales y grupales.
7. Persistir historial local para consulta y filtrado posterior.

## Diagrama lógico de módulos

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ UI (React)                                                                 │
│ App.jsx + StepConfiguracion + StepIngresoRespuestas + StepRevision +       │
│ StepReporteFinal + TopBar + StepIndicator                                  │
└───────────────┬────────────────────────────────────────────────────────────┘
                │ eventos/estado
                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Dominio / Flujo                                                            │
│ hooks/useExamWorkflow (navegación por pasos)                               │
│ hooks/useReportes (estado de historial y filtros)                          │
│ utils/examUtils (parseo OCR, limpieza, mapeo de letras, CSV helpers)       │
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
│Anthropic API  │              │almacenamiento │           │.pdf / .csv    │
└───────────────┘              └───────────────┘           └───────────────┘
```

## Flujo de datos de punta a punta

1. **Configuración**
   - La UI captura `materia`, `grupo`, `fecha`, `estudiante`, `totalPreguntas`, `claveRespuestas`.
   - Se validan obligatorios y formato de clave (`A|B|C|D`).

2. **OCR / transcripción**
   - Modo transcripción: texto manual → `convertirTextoALista` / `limpiarRespuestas`.
   - Modo imagen: archivo → `procesarImagenOCR` (Tesseract) → texto detectado → `parsearOCRPorNumeroPregunta`.

3. **Scoring automático**
   - Se compara respuesta del estudiante vs clave oficial por índice.
   - Se calcula `puntaje` por pregunta (`100 / totalPreguntas` cuando correcta; de lo contrario 0).
   - Se genera `resultadoRevision`: aciertos, errores, porcentaje y puntaje total.

4. **IA (sugerencia docente)**
   - Si existe API key en `localStorage`, se invoca `sugerirCalificacionIA`.
   - Se envía contexto del examen + puntaje automático.
   - Se recibe JSON con `puntuacion_sugerida` y `justificacion_breve`.
   - La sugerencia autocompleta `decisionFinal`, editable manualmente.

5. **Reporte**
   - Se arma un objeto `reporte` con examen, estudiante, respuestas, desglose, justificaciones y calificación final.
   - Se puede exportar reporte individual en PDF o CSV.

6. **Historial**
   - El reporte se inserta al inicio del arreglo `reportes`.
   - `useReportes` persiste automáticamente en `localStorage`.
   - La UI filtra historial por materia, grupo y fecha; también permite exportación grupal CSV.

## Contratos de entrada/salida por servicio

### `services/ocrService.js`

#### `procesarImagenOCR({ archivoImagen, totalPreguntas, onProgress })`
- **Entrada**
  - `archivoImagen: File | Blob`
  - `totalPreguntas: number`
  - `onProgress?: (porcentaje: number) => void`
- **Salida (Promise resolve)**
  - `{ textoDetectado: string, respuestasParseadas: string[] }`
- **Errores relevantes**
  - Si no hay respuestas válidas parseadas, lanza error de legibilidad.

### `services/aiService.js`

#### `sugerirCalificacionIA({ apiKey, datos, puntaje })`
- **Entrada**
  - `apiKey: string` (Anthropic)
  - `datos: { materia, grupo, fecha, totalPreguntas, ... }`
  - `puntaje: number` (0–100)
- **Salida (Promise resolve)**
  - `{ puntuacion: string, justificacion: string }` (`puntuacion` con 2 decimales)
- **Errores relevantes**
  - Timeout a 20s (`AbortError`).
  - Error HTTP/JSON inválido.
  - `puntuacion_sugerida` fuera de rango.

### `services/storageService.js`

- `leerApiKey(): string`
- `guardarApiKey(apiKey: string): void`
- `eliminarApiKey(): void`
- `leerDecisionFinal(): { puntuacion: string, justificacion: string }`
- `guardarDecisionFinal(decisionFinal: object): void`
- `leerReportes(): Reporte[]`
- `guardarReportes(reportes: Reporte[]): void`

> Persistencia local en claves: `corrector_anthropic_api_key`, `corrector_decision_final`, `corrector_historial_reportes_v1`.

### `services/exportService.js`

- `exportarIndividualCSV(reporte: Reporte): void`
- `exportarIndividualPDF(reporte: Reporte): void`
- `exportarGrupoCSV(reportesFiltrados: Reporte[]): void`

**Comportamiento**: generan archivos y disparan descarga en navegador (no devuelven payload de datos).
