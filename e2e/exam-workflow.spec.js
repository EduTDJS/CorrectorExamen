import { expect, test } from '@playwright/test';
import { proveedorMock, reporteGuardadoFactory, sugerenciaIaMock } from './fixtures/mockData';

test.describe('Flujo E2E de corrección de examen', () => {
  test('caso feliz: configura, corrige, solicita IA, ajusta y guarda reporte', async ({ page }) => {
    await page.route('**/api/calificacion/proveedor', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(proveedorMock)
      });
    });

    await page.route('**/api/calificacion/sugerir', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sugerenciaIaMock)
      });
    });

    await page.route('**/api/reportes', async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [] })
        });
        return;
      }

      const payload = request.postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(reporteGuardadoFactory(payload))
      });
    });

    await page.goto('/');

    await page.getByLabel('Materia').fill('Matemática');
    await page.getByLabel('Grupo').fill('G1');
    await page.getByLabel('Fecha').fill('2026-03-26');
    await page.getByLabel('Nombre estudiante').fill('Ana Pérez');
    await page.getByLabel('Matrícula estudiante').fill('2026001');
    await page.getByLabel('Total de preguntas').fill('5');
    await page.getByLabel('Clave de respuestas (solo A/B/C/D)').fill('ABCDA');

    await page.getByRole('button', { name: 'Siguiente' }).click();

    await page.getByLabel('Respuestas del estudiante (A/B/C/D)').fill('ABCDA');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await page.getByRole('button', { name: 'Sugerir calificación con IA' }).click();
    await expect(page.getByText('mock-provider')).toBeVisible();

    await page.getByRole('button', { name: 'Siguiente' }).click();

    await page.getByLabel('Puntuación final (0-100)').fill('90');
    await page.getByLabel('Justificación final').fill('Ajuste final de docente sobre sugerencia IA mock.');

    await page.getByRole('button', { name: 'Guardar reporte' }).click();

    await expect(page.getByText('Estado del reporte actual:')).toBeVisible();
    await expect(page.getByText('Guardado')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Ana Pérez' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '2026001' })).toBeVisible();
  });

  test('importa CSV y permite cargar fila para edición manual', async ({ page }) => {
    await page.route('**/api/calificacion/proveedor', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(proveedorMock)
      });
    });

    await page.route('**/api/reportes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] })
      });
    });

    await page.goto('/');

    await page.getByLabel('Materia').fill('Química');
    await page.getByLabel('Grupo').fill('Q1');
    await page.getByLabel('Fecha').fill('2026-03-26');
    await page.getByLabel('Nombre estudiante').fill('Temporal');
    await page.getByLabel('Matrícula estudiante').fill('0000');
    await page.getByLabel('Total de preguntas').fill('4');
    await page.getByLabel('Clave de respuestas (solo A/B/C/D)').fill('ABCD');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    const csvContent = [
      'estudianteNombre,estudianteMatricula,respuestas',
      'Laura,2026111,ABCD',
      'Registro Malo,2026222,AZCD'
    ].join('\n');

    await page.getByLabel('Archivo de importación').setInputFiles({
      name: 'lote.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent)
    });

    await expect(page.getByText('Leídas: 2 · Válidas: 1 · Errores: 1 · Duplicados: 0')).toBeVisible();
    await page.getByRole('button', { name: 'Cargar en formulario' }).click();
    await expect(page.getByLabel('Respuestas del estudiante (A/B/C/D)')).toHaveValue('ABCD');
  });
});
