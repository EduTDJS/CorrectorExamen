# Coding Standards

Este documento define convenciones para mantener uniformidad y facilitar revisión de cambios.

## Convenciones de nombres

### Componentes

- Usa **PascalCase** para nombres de componentes y archivos.
- El nombre debe describir función visual o de dominio.
- Ejemplos:
  - `TopBar.jsx`
  - `StepIndicator.jsx`
  - `StepRevision.jsx`

### Hooks

- Usa prefijo obligatorio `use` + PascalCase.
- El archivo debe reflejar el nombre exportado principal.
- Ejemplos:
  - `useExamWorkflow.js`
  - `useReportes.js`

### Servicios

- Usa sufijo `Service` en nombre lógico y archivo en `camelCase` terminado en `Service.js`.
- Cada servicio debe encapsular un tipo de integración/IO.
- Ejemplos:
  - `aiService.js`
  - `ocrService.js`
  - `storageService.js`

### Constantes

- Constantes globales compartidas: `UPPER_SNAKE_CASE`.
- Constantes locales limitadas a función/componente: `camelCase` con `const`.
- Si una constante crece y se reutiliza, muévela a módulo dedicado (`constants/` o `utils/` según contexto).

## Reglas de tamaño máximo recomendado

Estos límites son guías de mantenibilidad (no bloqueantes), pero deben respetarse salvo justificación en PR:

- Archivos de componente/hook/servicio: **máximo recomendado 300 líneas**.
- Funciones individuales: **máximo recomendado 60 líneas**.
- Funciones con múltiples ramas de decisión: prioriza extraer subfunciones.

Cuando se exceda:

- Documenta en PR por qué no se fragmentó.
- Considera dividir por responsabilidad o por caso de uso.

## Criterios para crear servicio, hook o util

### Crear un servicio (`src/services/`)

Crea servicio cuando:

- Hay interacción con API externa (`fetch`, SDKs, IA).
- Hay persistencia (ej. `localStorage`) o exportación de archivos.
- Hay side effects o dependencia de infraestructura.

No crear servicio para lógica puramente transformacional.

### Crear un hook (`src/hooks/`)

Crea hook cuando:

- Hay estado React y/o efectos que se reutilizan.
- Se necesita encapsular lógica de flujo de dominio entre varias vistas.
- Se busca simplificar componentes grandes separando comportamiento.

Evita hooks para lógica trivial usada una sola vez.

### Crear util (`src/utils/`)

Crea util cuando:

- La lógica es pura (sin IO, sin estado React, sin efectos secundarios).
- Se reutiliza en más de un módulo o mejora legibilidad de una unidad compleja.
- Es una transformación, parser, normalización o cálculo determinista.

Si la función empieza a depender de contexto de infraestructura, migrarla a `services`.

## Checklist de documentación al cambiar comportamiento

- **Si cambia comportamiento, actualizar README + docs/.**

