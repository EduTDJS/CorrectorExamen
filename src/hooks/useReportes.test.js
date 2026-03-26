import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { agruparReportesPorMateria, useReportes } from './useReportes';
import {
  guardarReportes,
  leerReportes,
  listarReportesApi
} from '../services/storageService';

vi.mock('../services/storageService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    guardarReportes: vi.fn(),
    leerReportes: vi.fn(),
    listarReportesApi: vi.fn(),
    guardarReporteApi: vi.fn()
  };
});

describe('agruparReportesPorMateria', () => {
  it('agrupa por carpeta de materia normalizada', () => {
    const reportes = [
      {
        id: 'r-1',
        creadoEn: '2026-03-26T00:00:00.000Z',
        examen: { materia: 'Contabilidad I' },
        organizacion: { materiaNormalizada: 'contabilidad i', materiaFolderId: 'materia:contabilidad i' }
      },
      {
        id: 'r-2',
        creadoEn: '2026-03-25T00:00:00.000Z',
        examen: { materia: 'contabilidad i' },
        organizacion: { materiaNormalizada: 'contabilidad i', materiaFolderId: 'materia:contabilidad i' }
      }
    ];

    const agrupado = agruparReportesPorMateria(reportes);
    expect(agrupado).toHaveLength(1);
    expect(agrupado[0].totalReportes).toBe(2);
    expect(agrupado[0].reportes.map((rep) => rep.id)).toEqual(['r-1', 'r-2']);
  });
});

describe('useReportes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('usa backend activo sin escribir fallback local', async () => {
    const reporteBackend = {
      id: 'backend-1',
      creadoEn: '2026-03-26T10:00:00.000Z',
      examen: { materia: 'Matemática', grupo: 'A', fecha: '2026-03-26' },
      organizacion: { materiaNormalizada: 'matematica', materiaFolderId: 'materia:matematica' }
    };

    listarReportesApi.mockResolvedValue([reporteBackend]);
    leerReportes.mockReturnValue([{ id: 'local-1' }]);

    const { result } = renderHook(() => useReportes());

    await waitFor(() => {
      expect(result.current.reportes).toEqual([reporteBackend]);
    });

    expect(leerReportes).not.toHaveBeenCalled();
    expect(guardarReportes).not.toHaveBeenCalled();
  });

  it('usa fallback local cuando backend no está disponible', async () => {
    const reporteLocal = {
      id: 'local-1',
      creadoEn: '2026-03-26T08:00:00.000Z',
      examen: { materia: 'Historia', grupo: 'B', fecha: '2026-03-26' },
      organizacion: { materiaNormalizada: 'historia', materiaFolderId: 'materia:historia' }
    };

    listarReportesApi.mockRejectedValue(new Error('backend down'));
    leerReportes.mockReturnValue([reporteLocal]);

    const { result } = renderHook(() => useReportes());

    await waitFor(() => {
      expect(result.current.reportes).toEqual([reporteLocal]);
    });

    expect(leerReportes).toHaveBeenCalledTimes(1);
    expect(guardarReportes).toHaveBeenCalledWith([reporteLocal]);
  });
});
