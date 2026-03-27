# CalificaYa

CalificaYa es una aplicación web para configurar, corregir y exportar resultados de exámenes, con OCR y sugerencia de calificación asistida por IA.

## Arquitectura

- [Arquitectura del sistema](docs/architecture.md)
- [UX de importación de respuestas](docs/ux-importacion-respuestas.md)
- [Modelo de datos](docs/data-model.md)
- [Seguridad](docs/security.md)
- [ADRs (Architecture Decision Records)](docs/adr/README.md)
- [Roadmap de mejoras](docs/improvements-roadmap.md)
- [Reporte de accesibilidad del workflow](docs/accessibility-report.md)

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
- `npm run db:migrate` aplica migraciones de base de datos (`backend/db/runMigrations.js`).
- `npm run db:seed` carga un dataset mínimo determinístico e idempotente para desarrollo (`backend/db/seed.js`).
- `npm run preview` previsualiza el build.
- `npm run lint` valida reglas de ESLint para React + Vite.
- `npm run test` ejecuta la suite de pruebas con Vitest (sin cobertura, útil para iteración local).
- `npm run test:ci` ejecuta Vitest con cobertura (`--coverage`) y aplica umbrales globales y por archivo.
- `npm run test:watch` ejecuta pruebas en modo observación local.
- `npm run format` aplica formateo con Prettier.
- `npm run test:e2e` ejecuta pruebas end-to-end con Playwright sobre build local.
- `npm run test:e2e:ui` abre el runner UI de Playwright para depuración local.

## Bootstrap de base de datos local

Para preparar rápidamente un entorno con datos de ejemplo reproducibles:

1. `npm run db:migrate`
2. `npm run db:seed`

El seed carga un dataset mínimo sobre `schools`, `groups`, `exams`, `students`, `submissions`, `grades`, `reports` y `audit_logs`, usando IDs `seed_*` y validación por conteos esperados para detectar cargas incompletas.

## Calidad local y CI

Flujo recomendado antes de abrir PR:

1. `npm install`
2. `npm run lint`
3. `npm run test:ci` (incluye quality gate de cobertura para módulos críticos)
4. `npm run build`
5. `npm run test:e2e`

## Mapa de módulos

```text
backend/
├── server.js                            # API interna /api/calificacion/sugerir
└── server.test.js                       # Pruebas Vitest del contrato HTTP y errores de proveedor

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
│   ├── importService.js                 # Importación y validación CSV/Excel
│   ├── ocrService.js                    # OCR con Tesseract
│   └── storageService.js                # localStorage (decisión final, reportes)
├── utils/
│   └── examUtils.js
├── main.jsx
└── styles.css
```

## Flujo implementado

1. Configuración del examen (materia, grupo, fecha, total de preguntas, clave).
2. Ingreso de respuestas por transcripción manual, carga de lote CSV/Excel o foto/escaneo.
3. Procesamiento OCR en cliente con Tesseract.js y parser por número de pregunta.
4. Revisión editable de respuestas en tabla antes de calificar.
5. Revisión de calificaciones (aciertos, errores, porcentaje y puntaje) con desglose por pregunta basado en evidencia (clave, respuesta, estado, confianza OCR y fuente).
6. Sugerencia de calificación con proveedor de IA configurable (`anthropic` u `openai`) usando prompt interno en español con criterios contables.
7. Reporte final con decisión final editable de la profesora y exportación simulada.

## Contrato de importación (CSV/Excel)

- Campos obligatorios por fila: `estudianteNombre`, `estudianteMatricula`, `respuestas`.
- Normalización de respuestas: mayúsculas y tolerancia OCR (`4→A`, `8→B`, `(→C`, `0/O/Q→D`).
- Política de duplicados: para matrícula repetida en el mismo archivo se conserva la última fila válida.
- Límite de archivo: **2MB**.
- Máximo de filas por importación: **200**.
- El paso de ingreso permite previsualizar filas válidas, revisar errores por registro y cargar una fila al formulario para corrección manual antes de guardar.

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

## Persistencia de decisión final y reportes

- **Backend primario:** la persistencia de reportes usa `GET/POST /api/reportes` como fuente de verdad en ejecución.
- **Fallback controlado:** `localStorage` se usa solo en modo degradado (offline/desarrollo o caída del backend), no como ruta primaria.
- **Decisión final editable:** la puntuación/justificación docente se conserva para edición y forma parte del objeto de reporte persistido.
- **Fuente de comportamiento en runtime:** el flujo está implementado en `src/hooks/useReportes.js` (estrategia backend-first + fallback) y `src/services/storageService.js` (cliente API y almacenamiento local de respaldo).


## Nota de operación offline/degradada

Para QA y soporte: si `/api/reportes` no está disponible o responde error de conectividad, la app activa automáticamente persistencia local de respaldo (`localStorage`). En ese estado, el historial refleja datos locales del navegador actual; al restablecer backend/sesión, el flujo vuelve a priorizar API.

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
7. Historial de reportes con filtros (hidratado desde backend cuando está disponible).

## Buenas prácticas de captura de fotos

Para mejorar la precisión del OCR cuando se corrige por imagen:

- **Iluminación uniforme:** usa luz frontal, evita contraluces y sombras sobre la hoja.
- **Enfoque nítido:** espera que la cámara enfoque antes de disparar; si queda borrosa, repite la captura.
- **Encuadre completo:** incluye la hoja entera en formato vertical, sin cortar márgenes ni números de pregunta.
- **Resolución suficiente:** prefiere fotos de al menos 900x1200 píxeles para lectura estable.
- **Evita panorámicas o recortes extremos:** el OCR funciona mejor cuando la hoja ocupa la mayor parte del encuadre.


## Cobertura de pruebas (Vitest)

La cobertura se genera con provider `v8` y reportes `text`, `lcov` y `html` en la carpeta `coverage/`.

Umbrales vigentes:

- **Globales**: Statements **70%**, Branches **60%**, Functions **70%**, Lines **70%**.
- **Módulos críticos (por archivo, quality gate)**: `backend/server.js`, `backend/ai/providerOrchestrator.js`, `src/hooks/useReportes.js`, `src/services/aiService.js` con mínimo **80%** en Statements, Functions y Lines (Branches mantiene el umbral global del proyecto).

Si cualquier umbral no se cumple, `npm run test:ci` falla y el workflow de CI marca el job como fallido.

Cómo interpretar los reportes:

- **text**: resumen inmediato en consola para feedback rápido.
- **lcov** (`coverage/lcov.info`): formato estándar para integraciones con herramientas de calidad.
- **html** (`coverage/index.html`): vista navegable para identificar archivos/líneas sin cubrir.

## Variables de entorno de IA

- `AI_PROVIDER` (opcional, default `anthropic`): proveedor activo (`anthropic` u `openai`).
- `ANTHROPIC_API_KEY` (obligatoria si `AI_PROVIDER=anthropic`).
- `ANTHROPIC_MODEL` (opcional, default `claude-sonnet-4-20250514`).
- `OPENAI_API_KEY` (obligatoria si `AI_PROVIDER=openai`).
- `OPENAI_MODEL` (opcional, default `gpt-4o-mini`).
- `AI_REQUEST_TIMEOUT_MS` (opcional, default `20000`).
- `INTERNAL_AUTH_TOKEN` (obligatoria): token compartido esperado en header interno para proteger `POST /api/calificacion/sugerir`.
- `INTERNAL_AUTH_HEADER` (opcional, default `x-internal-token`): nombre del header donde se envía el token interno.
- `RATE_LIMIT_WINDOW_MS` (opcional, default `60000`): ventana temporal de rate limit en milisegundos.
- `RATE_LIMIT_MAX_REQUESTS` (opcional, default `20`): máximo de solicitudes permitidas por ventana.
- `RATE_LIMIT_KEY_STRATEGY` (opcional, default `token_or_ip`): estrategia de partición para rate limit (`token`, `ip`, `token_or_ip`).
- `PORT` (opcional, por defecto `8787`).

## Ejecución local

1. Inicia backend en una terminal:

```bash
AI_PROVIDER=anthropic ANTHROPIC_API_KEY=tu_key INTERNAL_AUTH_TOKEN=token_interno_seguro npm run dev:api
```

2. Inicia frontend en otra terminal:

```bash
npm run dev
```

> Vite proxy redirige `/api/*` a `http://localhost:8787`.

Ejemplo con OpenAI:

```bash
AI_PROVIDER=openai OPENAI_API_KEY=tu_key OPENAI_MODEL=gpt-4o-mini INTERNAL_AUTH_TOKEN=token_interno_seguro npm run dev:api
```


## Pruebas E2E (Playwright)

La carpeta `e2e/` contiene el caso feliz completo del flujo:

1. Configuración del examen.
2. Ingreso de respuestas.
3. Solicitud de sugerencia IA (mock backend).
4. Ajuste de decisión final.
5. Guardado de reporte.
6. Verificación de aparición en historial.

Para evitar dependencia de proveedores reales, las pruebas interceptan:

- `GET /api/calificacion/proveedor`
- `POST /api/calificacion/sugerir`
- `GET/POST /api/reportes`

con fixtures determinísticos ubicados en `e2e/fixtures/mockData.js`.

### Ejecución local E2E

```bash
npm install
npm run build
npm run test:e2e
```

### Ejecución en pipeline

El workflow `.github/workflows/ci.yml` ejecuta en orden:

1. `lint`
2. tests unit/integration con cobertura (`npm run test:ci`)
3. E2E (`npm run test:e2e`)

El job E2E instala Chromium vía Playwright y publica el reporte HTML como artifact.
