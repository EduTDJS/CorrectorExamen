# CalificaYa

CalificaYa es una aplicación web para configurar, corregir y exportar resultados de exámenes, con OCR y sugerencia de calificación asistida por IA.

## Arquitectura

- [Arquitectura del sistema](docs/architecture.md)
- [Modelo de datos](docs/data-model.md)
- [Seguridad](docs/security.md)
- [ADRs (Architecture Decision Records)](docs/adr/README.md)

## Cómo contribuir

Consulta la guía de contribución en [CONTRIBUTING.md](CONTRIBUTING.md).

## Requisitos

- Node.js 18+
- npm 9+

## Scripts

- `npm install` instala dependencias.
- `npm run dev` ejecuta el frontend (Vite).
- `npm run dev:api` ejecuta el backend local (`backend/server.js`).
- `npm run build` construye la versión de producción.
- `npm run preview` previsualiza el build.
- `npm run lint` valida reglas de ESLint para React + Vite.
- `npm run test` ejecuta la suite de pruebas con Vitest en modo CI.
- `npm run test:watch` ejecuta pruebas en modo observación local.
- `npm run format` aplica formateo con Prettier.

## Calidad local y CI

Flujo recomendado antes de abrir PR:

1. `npm install`
2. `npm run lint`
3. `npm run test`
4. `npm run build`

## Mapa de módulos

```text
backend/
└── server.js                            # API interna /api/calificacion/sugerir

src/
├── App.jsx                              # Orquestador del flujo y composición de UI
├── components/
│   ├── StepIndicator.jsx
│   └── TopBar.jsx
├── features/
│   └── exam-workflow/
│       ├── StepConfiguracion.jsx
│       ├── StepIngresoRespuestas.jsx
│       ├── StepReporteFinal.jsx
│       └── StepRevision.jsx
├── hooks/
│   ├── useExamWorkflow.js
│   └── useReportes.js
├── services/
│   ├── aiService.js                     # Cliente del endpoint interno /api/calificacion/sugerir
│   ├── exportService.js                 # Exportación PDF/CSV
│   ├── ocrService.js                    # OCR con Tesseract
│   └── storageService.js                # localStorage (decisión final, reportes)
├── utils/
│   └── examUtils.js
├── main.jsx
└── styles.css
```

## Flujo implementado

1. Configuración del examen (materia, grupo, fecha, total de preguntas, clave).
2. Ingreso de respuestas por transcripción manual o carga de foto/escaneo.
3. Procesamiento OCR en cliente con Tesseract.js y parser por número de pregunta.
4. Revisión editable de respuestas en tabla antes de calificar.
5. Revisión de calificaciones (aciertos, errores, porcentaje y puntaje) con desglose por pregunta basado en evidencia (clave, respuesta, estado, confianza OCR y fuente).
6. Sugerencia de calificación con proveedor de IA configurable (`anthropic` u `openai`) usando prompt interno en español con criterios contables.
7. Reporte final con decisión final editable de la profesora y exportación simulada.

## Contrato de desglose por pregunta

El sistema usa un contrato explícito y reutilizable para cada ítem del desglose (`puntuacionPorPregunta[*].desglose`), tanto en UI, persistencia y exportación:

- `criterioAplicado`: regla de evaluación usada en la comparación.
- `evidencia`: datos trazables de la corrección:
  - `clave`
  - `respuestaEstudiante`
  - `estado` (`correcta|incorrecta`)
  - `confianzaOCR`
  - `fuente`
- `resultado`: conclusión del ítem (incluye impacto en puntaje).
- `recomendacion`: acción pedagógica o de verificación sugerida.

En **Revisión de calificaciones**, el razonamiento se visualiza en un panel expandible por fila. En **exportación PDF/CSV**, estos mismos campos se incluyen por pregunta.

## Integración IA multi-proveedor (backend)

- El frontend siempre llama `POST /api/calificacion/sugerir`.
- El backend usa patrón **provider/strategy** con selector `AI_PROVIDER`:
  - `anthropic` → `https://api.anthropic.com/v1/messages`
  - `openai` → `https://api.openai.com/v1/chat/completions`
- Contrato normalizado de respuesta al frontend (estable):
  - `puntuacion`
  - `justificacion`
  - `proveedor`
  - `modelo`
- La UI también consulta `GET /api/calificacion/proveedor` para mostrar proveedor/modelo activos.

## Persistencia de decisión final

- La puntuación y justificación finales de la profesora se persisten en `localStorage`.
- Se guarda siempre la decisión final editable, independientemente de la sugerencia de IA.

## Manejo robusto de errores

La UI muestra errores claros en español para:

- API key inválida o sin permisos (`401` / `authentication_error`).
- Límite de cuota/tasa (`429` / `rate_limit_error`).
- Timeout de red (cancelación tras 20 segundos).
- Respuestas de IA mal formadas o con puntuación fuera de rango.
1. Configuración del examen.
2. Ingreso de respuestas (manual u OCR).
3. Scoring automático.
4. Sugerencia IA vía backend propio.
5. Ajuste docente final con guardado explícito del reporte.
6. Exportación individual (PDF/CSV) desde reporte guardado o snapshot actual, sin duplicar historial.
7. Historial local de reportes con filtros.

## Buenas prácticas de captura de fotos

Para mejorar la precisión del OCR cuando se corrige por imagen:

- **Iluminación uniforme:** usa luz frontal, evita contraluces y sombras sobre la hoja.
- **Enfoque nítido:** espera que la cámara enfoque antes de disparar; si queda borrosa, repite la captura.
- **Encuadre completo:** incluye la hoja entera en formato vertical, sin cortar márgenes ni números de pregunta.
- **Resolución suficiente:** prefiere fotos de al menos 900x1200 píxeles para lectura estable.
- **Evita panorámicas o recortes extremos:** el OCR funciona mejor cuando la hoja ocupa la mayor parte del encuadre.

## Variables de entorno de IA

- `AI_PROVIDER` (opcional, default `anthropic`): proveedor activo (`anthropic` u `openai`).
- `ANTHROPIC_API_KEY` (obligatoria si `AI_PROVIDER=anthropic`).
- `ANTHROPIC_MODEL` (opcional, default `claude-sonnet-4-20250514`).
- `OPENAI_API_KEY` (obligatoria si `AI_PROVIDER=openai`).
- `OPENAI_MODEL` (opcional, default `gpt-4o-mini`).
- `AI_REQUEST_TIMEOUT_MS` (opcional, default `20000`).
- `PORT` (opcional, por defecto `8787`).

## Ejecución local

1. Inicia backend en una terminal:

```bash
AI_PROVIDER=anthropic ANTHROPIC_API_KEY=tu_key npm run dev:api
```

2. Inicia frontend en otra terminal:

```bash
npm run dev
```

> Vite proxy redirige `/api/*` a `http://localhost:8787`.

Ejemplo con OpenAI:

```bash
AI_PROVIDER=openai OPENAI_API_KEY=tu_key OPENAI_MODEL=gpt-4o-mini npm run dev:api
```
