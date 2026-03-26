# CorrectorExamen

Frontend web para configurar, corregir y exportar resultados de exámenes.

## Arquitectura

- [Arquitectura del sistema](docs/architecture.md)
- [Modelo de datos](docs/data-model.md)
- [Seguridad](docs/security.md)
- [ADRs (Architecture Decision Records)](docs/adr/README.md)

## Cómo contribuir

Consulta la guía de contribución en [CONTRIBUTING.md](CONTRIBUTING.md) para ramas, commits, política de PR y checklist obligatoria.

## Requisitos

- Node.js 18+
- npm 9+

## Scripts

- `npm install` instala dependencias.
- `npm run dev` ejecuta la aplicación en desarrollo.
- `npm run build` construye la versión de producción.
- `npm run preview` previsualiza el build.

## Mapa de módulos (refactor)

```text
src/
├── App.jsx                              # Orquestador del flujo y composición de UI
├── components/                          # Componentes presentacionales reutilizables
│   ├── StepIndicator.jsx
│   └── TopBar.jsx
├── features/
│   └── exam-workflow/                   # Vistas por paso del flujo guiado
│       ├── StepConfiguracion.jsx
│       ├── StepIngresoRespuestas.jsx
│       ├── StepReporteFinal.jsx
│       └── StepRevision.jsx
├── hooks/                               # Hooks de estado y comportamiento de dominio
│   ├── useExamWorkflow.js
│   └── useReportes.js
├── services/                            # Integraciones externas y persistencia
│   ├── aiService.js                     # Anthropic messages API
│   ├── exportService.js                 # Exportación PDF/CSV
│   ├── ocrService.js                    # OCR con Tesseract
│   └── storageService.js                # localStorage (API key, decisión final, reportes)
├── utils/
│   └── examUtils.js                     # Helpers puros: parseo, sanitización, CSV, mapeo PUCMM
├── main.jsx
└── styles.css
```

## Flujo implementado

1. Configuración del examen (materia, grupo, fecha, estudiante, total de preguntas y clave).
2. Ingreso de respuestas por transcripción manual o carga de foto/escaneo.
3. Procesamiento OCR en cliente con Tesseract.js y parser por número de pregunta.
4. Revisión de calificaciones con desglose por pregunta, puntaje por ítem y justificación IA por ítem.
5. Reporte individual con nota total sobre 100 y mapeo a escala PUCMM:
   - A: 90–100
   - B+: 85–89
   - B: 80–84
   - C+: 75–79
   - C: 70–74
   - D: 65–69
   - F: 0–64
6. Exportación individual en PDF (jsPDF) y CSV.
7. Vista grupal con tabla de estudiantes, notas, distribución de letras y exportación CSV grupal.
8. Historial persistido en `localStorage` con filtros por materia, grupo y fecha.

## Modelo de datos (persistido)

Cada reporte individual guardado en historial incluye:

- `examen`: configuración completa del examen.
- `estudiante`: nombre y matrícula.
- `respuestas`: lista y texto normalizado.
- `puntuacionPorPregunta`: arreglo con respuesta correcta, respuesta del estudiante, puntaje y estado.
- `justificacionesIA`: arreglo por pregunta con su justificación.
- `calificacionFinal`: nota sobre 100, letra PUCMM y justificación docente.

## Ajustes y seguridad de API key

- Hay un panel **Ajustes API** para capturar la API key de Anthropic.
- La API key se guarda localmente en `localStorage` y **no se hardcodea** en el código.
- Puede guardarse o eliminarse desde la UI.

## Integración de IA

- Se realiza `fetch` directo a `https://api.anthropic.com/v1/messages` desde `src/services/aiService.js`.
- El prompt interno exige salida JSON con:
  - `puntuacion_sugerida`
  - `justificacion_breve`
- La respuesta se parsea extrayendo JSON del texto devuelto.
- La sugerencia de IA autocompleta la decisión final, pero siempre puede editarse manualmente.
