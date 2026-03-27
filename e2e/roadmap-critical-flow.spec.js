import { expect, test } from '@playwright/test';
import {
  csvImportValido,
  expectedExportResponse,
  expectedPersistedReport,
  proveedorMock,
  reporteGuardadoFactory,
  sugerenciaIaMock
} from './fixtures/mockData';

test.describe('Roadmap - flujo E2E crítico', () => {
  test('configura, importa archivo, corrige, persiste en backend y exporta reporte', async ({ page }) => {
    let payloadPersistido = null;
    let reportePersistido = null;

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

      payloadPersistido = request.postDataJSON();
      reportePersistido = reporteGuardadoFactory(payloadPersistido);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(reportePersistido)
      });
    });

    await page.route('**/api/reportes/*/export', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(expectedExportResponse)
      });
    });

    await page.goto('/');

    // 1) Configuración de examen
    await page.getByLabel('Materia').fill(expectedPersistedReport.examen.materia);
    await page.getByLabel('Grupo').fill(expectedPersistedReport.examen.grupo);
    await page.getByLabel('Fecha').fill(expectedPersistedReport.examen.fecha);
    await page.getByLabel('Nombre estudiante').fill('Temporal');
    await page.getByLabel('Matrícula estudiante').fill('0000');
    await page.getByLabel('Total de preguntas').fill(String(expectedPersistedReport.examen.totalPreguntas));
    await page.getByLabel('Clave de respuestas (solo A/B/C/D)').fill(expectedPersistedReport.examen.claveRespuestas);
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // 2) Importación por archivo
    await page.getByLabel('Archivo de importación').setInputFiles({
      name: 'respuestas.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvImportValido)
    });

    await expect(page.getByText('Leídas: 2 · Válidas: 2 · Errores: 0 · Duplicados: 0')).toBeVisible();
    await page.getByRole('button', { name: 'Cargar en formulario' }).first().click();
    await expect(page.getByLabel('Respuestas del estudiante (A/B/C/D)')).toHaveValue(expectedPersistedReport.respuestas.texto);
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // 3) Revisión/corrección
    await page.getByRole('button', { name: 'Sugerir calificación con IA' }).click();
    await expect(page.getByText('mock-provider')).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await page.getByLabel('Puntuación final (0-100)').fill(String(expectedPersistedReport.calificacionFinal.notaSobre100));
    await page.getByLabel('Justificación final').fill(expectedPersistedReport.calificacionFinal.justificacionDocente);

    // 4) Persistencia en backend
    await page.getByRole('button', { name: 'Guardar reporte' }).click();

    await expect(page.getByText('Estado del reporte actual:')).toBeVisible();
    await expect(page.getByText('Guardado')).toBeVisible();
    await expect(page.getByRole('cell', { name: expectedPersistedReport.estudiante.nombre })).toBeVisible();
    await expect(page.getByRole('cell', { name: expectedPersistedReport.estudiante.matricula })).toBeVisible();

    expect(payloadPersistido).not.toBeNull();
    expect(payloadPersistido).toMatchObject(expectedPersistedReport);
    expect(reportePersistido).not.toBeNull();
    expect(reportePersistido).toMatchObject(expectedPersistedReport);

    // 5) Exportación /api/reportes/:id/export
    const exportResponse = await page.evaluate(async ({ reportId }) => {
      const response = await fetch(`/api/reportes/${reportId}/export`);
      return response.json();
    }, { reportId: expectedPersistedReport.id });

    expect(exportResponse).toMatchObject(expectedExportResponse);
    expect(exportResponse.archivos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tipo: 'pdf', nombre: expect.stringContaining('.pdf') }),
        expect.objectContaining({ tipo: 'csv', nombre: expect.stringContaining('.csv') })
      ])
    );
  });
});
