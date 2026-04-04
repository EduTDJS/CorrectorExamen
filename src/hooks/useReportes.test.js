import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { agruparReportesPorMateria, detectarMatriculasDuplicadas, useReportes } from './useReportes';
import {
  guardarOperacionesImportacion,
  guardarReporteApi,
  guardarReportes,
  leerOperacionesImportacion,
  leerReportes,
  listarReportesApi
} from '../services/storageService';

vi.mock('../services/storageService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    guardarReportes: vi.fn(),
    guardarOperacionesImportacion: vi.fn(),
    leerOperacionesImportacion: vi.fn(() => []),
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

  it('normaliza y ordena carpetas al agrupar', () => {
    const agrupado = agruparReportesPorMateria([
      {
        id: 'r-3',
        creadoEn: '2026-03-25T10:00:00.000Z',
        examen: { materia: 'Zoología' }
      },
      {
        id: 'r-4',
        creadoEn: '2026-03-26T10:00:00.000Z',
        examen: { materia: '' }
      },
      {
        id: 'r-5',
        creadoEn: '2026-03-25T09:00:00.000Z',
        examen: { materia: 'álgebra' }
      }
    ]);

    expect(agrupado.map((item) => item.materia)).toEqual(['álgebra', 'Sin materia', 'Zoología']);
    expect(agrupado[1]).toMatchObject({
      materiaNormalizada: 'sin materia',
      materiaFolderId: 'materia:sin materia'
    });
  });
});

describe('detectarMatriculasDuplicadas', () => {
  it('detecta matrículas ya registradas y evita duplicados en la entrada', () => {
    const reportes = [{ estudiante: { matricula: 'A-001' } }, { estudiante: { matricula: 'B-002' } }];
    const duplicadas = detectarMatriculasDuplicadas(reportes, ['A-001', 'A-001', 'X-100', 'B-002']);
    expect(duplicadas).toEqual(['A-001', 'B-002']);
  });
});

describe('useReportes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    leerOperacionesImportacion.mockReturnValue([]);
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
    expect(guardarOperacionesImportacion).toHaveBeenCalledWith([]);
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

  it('propaga error de sesión cuando backend responde 401/403 en carga inicial', async () => {
    listarReportesApi.mockRejectedValue({ status: 401, message: 'Sesión vencida' });
    leerReportes.mockReturnValue([]);

    const { result } = renderHook(() => useReportes());

    await waitFor(() => {
      expect(result.current.errorSesion).toBe('Sesión vencida');
    });
  });

  it('guarda reporte por API y actualiza existente cuando usa backend', async () => {
    const reporteOriginal = {
      id: 'rep-1',
      creadoEn: '2026-03-25T10:00:00.000Z',
      examen: { materia: 'Historia', grupo: 'A', fecha: '2026-03-25' }
    };
    const reporteEditado = {
      ...reporteOriginal,
      examen: { ...reporteOriginal.examen, grupo: 'B' }
    };

    listarReportesApi.mockResolvedValue([reporteOriginal]);
    guardarReporteApi.mockResolvedValue(reporteEditado);

    const { result } = renderHook(() => useReportes());
    await waitFor(() => expect(result.current.reportes).toEqual([reporteOriginal]));

    await act(async () => {
      await result.current.guardarReporte(reporteEditado);
    });

    expect(guardarReporteApi).toHaveBeenCalledWith(reporteEditado);
    expect(result.current.reportes).toEqual([reporteEditado]);
  });

  it('guarda en memoria local cuando opera en fallback', async () => {
    listarReportesApi.mockRejectedValue(new Error('backend off'));
    leerReportes.mockReturnValue([]);

    const { result } = renderHook(() => useReportes());
    await waitFor(() => expect(result.current.reportes).toEqual([]));
    await waitFor(() => expect(leerReportes).toHaveBeenCalledTimes(1));

    const nuevo = {
      id: 'local-new',
      creadoEn: '2026-03-26T09:00:00.000Z',
      examen: { materia: 'Historia', grupo: 'A', fecha: '2026-03-26' }
    };

    await act(async () => {
      await result.current.guardarReporte(nuevo);
    });

    expect(result.current.reportes).toEqual([nuevo]);
    expect(guardarReporteApi).not.toHaveBeenCalled();
  });

  it('propaga error cuando guardarReporte API devuelve 403', async () => {
    const existente = {
      id: 'rep-base',
      creadoEn: '2026-03-26T10:00:00.000Z',
      examen: { materia: 'Historia', grupo: 'A', fecha: '2026-03-26' }
    };
    listarReportesApi.mockResolvedValue([existente]);
    guardarReporteApi.mockRejectedValue({ status: 403, message: 'No autorizado' });

    const { result } = renderHook(() => useReportes());
    await waitFor(() => expect(result.current.reportes).toEqual([existente]));

    await expect(act(async () => {
      await result.current.guardarReporte({ id: 'r-denied', examen: { materia: 'A' } });
    })).rejects.toMatchObject({ status: 403 });

    expect(guardarReporteApi).toHaveBeenCalledTimes(1);
  });

  it('filtra reportes por materia, grupo y fecha', async () => {
    listarReportesApi.mockResolvedValue([
      {
        id: 'r1',
        creadoEn: '2026-03-26T10:00:00.000Z',
        examen: { materia: 'Matemática', grupo: 'A', fecha: '2026-03-26' },
        organizacion: { materiaNormalizada: 'matematica', materiaFolderId: 'materia:matematica' }
      },
      {
        id: 'r2',
        creadoEn: '2026-03-25T10:00:00.000Z',
        examen: { materia: 'Historia', grupo: 'B', fecha: '2026-03-25' },
        organizacion: { materiaNormalizada: 'historia', materiaFolderId: 'materia:historia' }
      }
    ]);

    const { result } = renderHook(() => useReportes());
    await waitFor(() => expect(result.current.reportes).toHaveLength(2));

    act(() => {
      result.current.setFiltrosHistorial({ materia: 'mate', grupo: 'A', fecha: '2026-03-26' });
    });

    expect(result.current.reportesFiltrados.map((item) => item.id)).toEqual(['r1']);
    expect(result.current.reportesAgrupadosPorMateria).toHaveLength(1);
    expect(result.current.reportesAgrupadosPorMateria[0].materia).toBe('Matemática');
  });

  it('registra operaciones de importación para trazabilidad', async () => {
    listarReportesApi.mockResolvedValue([]);
    leerOperacionesImportacion.mockReturnValue([]);

    const { result } = renderHook(() => useReportes());
    await waitFor(() => expect(result.current.reportes).toEqual([]));

    act(() => {
      result.current.guardarOperacionImportacion({
        timestamp: '2026-04-04T00:00:00.000Z',
        strategy: 'omitir_existentes',
        affectedMatriculas: ['2026001', '2026002']
      });
    });

    expect(result.current.operacionesImportacion).toHaveLength(1);
    expect(result.current.operacionesImportacion[0]).toMatchObject({
      strategy: 'omitir_existentes',
      affectedMatriculas: ['2026001', '2026002']
    });
    expect(guardarOperacionesImportacion).toHaveBeenCalledWith(result.current.operacionesImportacion);
  });
});
