import { render, screen } from '@testing-library/react';
import StepReporteFinal from './StepReporteFinal';

const crearProps = (overrides = {}) => ({
  datos: { estudianteNombre: 'Ana', estudianteMatricula: '2023001', materia: 'Historia', grupo: 'A-1', fecha: '2026-03-26' },
  notaFinalNumerica: 85,
  letraFinal: 'B+',
  decisionFinal: { puntuacion: '85', justificacion: 'Buen desempeño' },
  setDecisionFinal: vi.fn(),
  errores: {},
  guardarReporte: vi.fn(),
  exportarReporteActual: vi.fn(),
  reporteActualGuardado: false,
  bloqueoRevisionBajaConfianza: true,
  resumenBajaConfianzaRevision: { total: 2, revisadas: 1, pendientes: 1 },
  filtrosHistorial: { materia: '', grupo: '', fecha: '' },
  setFiltrosHistorial: vi.fn(),
  reportesFiltrados: [],
  reportesAgrupadosPorMateria: [],
  estadisticasGrupo: { A: 0, 'B+': 0, B: 0, 'C+': 0, C: 0, D: 0, F: 0 },
  exportarGrupoCSV: vi.fn(),
  exportarCarpetaMateriaCSV: vi.fn(),
  errorSesion: '',
  operacionesImportacion: [],
  exportarOperacionesImportacion: vi.fn(),
  ...overrides
});

describe('StepReporteFinal', () => {
  it('deshabilita guardado/exportación si hay baja confianza pendiente', () => {
    render(<StepReporteFinal {...crearProps()} />);

    expect(screen.getByRole('button', { name: 'Guardar reporte' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled();
    expect(screen.getByText(/Aún hay 1 preguntas de baja confianza pendientes de revisión/)).toBeInTheDocument();
  });
});
