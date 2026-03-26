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
