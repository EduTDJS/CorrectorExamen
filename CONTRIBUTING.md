# Contribuir a CalificaYa

Gracias por contribuir. Este documento define el flujo mínimo para mantener consistencia técnica y documental.

## Convención de ramas y commits

### Ramas

Usa ramas cortas y descriptivas basadas en `main`:

- `feat/<scope>-<descripcion-corta>` para nuevas funcionalidades.
- `fix/<scope>-<descripcion-corta>` para correcciones.
- `docs/<scope>-<descripcion-corta>` para cambios de documentación.
- `refactor/<scope>-<descripcion-corta>` para mejoras internas sin cambio funcional.
- `chore/<scope>-<descripcion-corta>` para tareas de mantenimiento.

Ejemplos:

- `feat/reportes-export-csv`
- `fix/ocr-parser-preguntas`
- `docs/arquitectura-flujo`

### Commits

Sigue convención tipo Conventional Commits:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `refactor: ...`
- `test: ...`
- `chore: ...`

Reglas:

- Un commit debe representar una unidad coherente de cambio.
- El mensaje debe explicar **qué** cambia, no solo el archivo tocado.
- Evita mezclar cambios de lógica y formato sin relación.

## Reglas de estructura de carpetas y límites de responsabilidad

Respeta la arquitectura del proyecto descrita en el `README.md` y `docs/architecture.md`.

- `src/components/`: componentes de UI presentacionales y reutilizables. Sin lógica de negocio compleja.
- `src/features/`: pantallas o pasos de flujo de negocio (composición de componentes + interacción de hooks).
- `src/hooks/`: lógica de estado y comportamiento reutilizable orientado a dominio.
- `src/services/`: integración con APIs externas, OCR, exportación y persistencia.
- `src/utils/`: funciones puras y helpers sin efectos secundarios.
- `docs/`: documentación de arquitectura, seguridad, modelo de datos y estándares.

Límites de responsabilidad:

- Evita llamadas directas a servicios desde componentes presentacionales.
- Reutiliza hooks para reglas de negocio compartidas.
- Mantén funciones puras en `utils` cuando no dependan de estado React ni de IO.
- Si una funcionalidad cruza múltiples capas, documenta la decisión en `docs/`.

## Regla de ADR para decisiones estructurales

Toda decisión estructural nueva (arquitectura, integraciones clave, persistencia, seguridad, exportación o cambios de límites entre módulos) **requiere un ADR** en `docs/adr/` antes de cerrar la PR.

Criterios mínimos:

- Crear un archivo con numeración incremental (`000X-...`).
- Incluir secciones: **Contexto**, **Decisión** y **Consecuencias**.
- Referenciar el ADR en la documentación relevante (`README.md` y/o `docs/architecture.md` cuando aplique).

## Política de Pull Request (PR)

Toda PR debe incluir:

1. **Descripción funcional** del cambio (qué problema resuelve y cómo).
2. **Alcance técnico** (archivos/módulos impactados).
3. **Pruebas ejecutadas**:
   - Al menos `npm run lint`, `npm run test`, `npm run build` y `npm run test:e2e`.
   - Si aplica, validación manual del flujo afectado en `npm run dev`.
4. **Documentación actualizada** cuando corresponda.

### Checklist obligatoria de PR

Marca estos ítems antes de solicitar revisión:

- [ ] El código compila y las pruebas/checks definidos pasan.
- [ ] No se mezclan cambios no relacionados en la misma PR.
- [ ] Se actualizó documentación técnica si cambió la arquitectura o decisiones.
- [ ] **Si cambia comportamiento, actualizar README + docs/.**



## Lint y pruebas (local/CI)

### Ejecución local recomendada

```bash
npm install
npm run lint
npm run test
npm run build
npm run test:e2e
```

Para desarrollo guiado por pruebas:

```bash
npm run test:watch
```

### Ejecución en CI

Configura el workflow para ejecutar:

```bash
npm ci
npm run lint
npm run test
npm run build
npm run test:e2e
```



## Pruebas E2E

La suite E2E usa Playwright en la carpeta `e2e/` con mocks determinísticos de backend para IA y reportes.

Comandos:

```bash
npm run build
npm run test:e2e
```

Para depurar localmente:

```bash
npm run test:e2e:ui
```

En CI (`.github/workflows/ci.yml`), el job E2E corre después de `lint` y de tests unit/integration.
