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
6. Sugerencia de calificación con Anthropic (`claude-sonnet-4-20250514`) usando prompt interno en español con criterios contables.
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

## Ajustes y seguridad de API key

- Hay un panel **Ajustes API** para capturar la API key de Anthropic.
- La API key se guarda localmente en `localStorage` y **no se hardcodea** en el código.
- Puede guardarse o eliminarse desde la UI.

## Integración de IA y parsing

- Se realiza `fetch` directo a `https://api.anthropic.com/v1/messages`.
- El prompt interno exige salida JSON con:
  - `puntuacion_sugerida`
  - `justificacion_breve`
- La respuesta se parsea de forma robusta extrayendo JSON del texto devuelto.
- La sugerencia de IA autocompleta la decisión final, pero siempre puede editarse manualmente.

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

## Integración de IA (estado actual)

- El frontend llama `POST /api/calificacion/sugerir`.
- El backend consulta `https://api.anthropic.com/v1/messages`.
- La API key de Anthropic se gestiona **solo en servidor** (`ANTHROPIC_API_KEY`).
- La UI ya no solicita secretos al usuario final.

## Ejecución local

1. Inicia backend en una terminal:

```bash
ANTHROPIC_API_KEY=tu_key npm run dev:api
```

2. Inicia frontend en otra terminal:

```bash
npm run dev
```

> Vite proxy redirige `/api/*` a `http://localhost:8787`.
