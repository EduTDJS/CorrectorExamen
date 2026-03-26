import { fireEvent, render, screen, within } from '@testing-library/react';

import App from './App';
import { exportarGrupoCSV, exportarIndividualCSV, exportarIndividualPDF } from './services/exportService';

vi.mock('./services/exportService', async () => {
  const actual = await vi.importActual('./services/exportService');
  return {
    ...actual,
    exportarIndividualCSV: vi.fn(),
    exportarIndividualPDF: vi.fn(),
    exportarGrupoCSV: vi.fn()
  };
});

describe('App - flujo guardar y exportar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('no duplica reportes al exportar varias veces un reporte guardado', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Materia'), { target: { value: 'Contabilidad I' } });
    fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: 'A-01' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-03-26' } });
    fireEvent.change(screen.getByLabelText('Nombre estudiante'), { target: { value: 'Ana Pérez' } });
    fireEvent.change(screen.getByLabelText('Matrícula estudiante'), { target: { value: '2023001' } });
    fireEvent.change(screen.getByLabelText('Total de preguntas'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Clave de respuestas (solo A/B/C/D)'), { target: { value: 'AB' } });

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    fireEvent.change(await screen.findByLabelText('Respuestas del estudiante (A/B/C/D)'), { target: { value: 'AB' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Siguiente' }));

    fireEvent.change(await screen.findByLabelText('Puntuación final (0-100)'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Justificación final'), { target: { value: 'Excelente desempeño' } });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar reporte' }));

    expect(await screen.findByText(/Estado del reporte actual:/)).toHaveTextContent('Guardado');

    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    expect(exportarIndividualPDF).toHaveBeenCalledTimes(2);
    expect(exportarIndividualCSV).toHaveBeenCalledTimes(1);

    const filas = within(screen.getByRole('table')).getAllByRole('row');
    expect(filas).toHaveLength(2);
    expect(screen.getByText(/Registros en carpeta:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Exportar carpeta CSV' }));
    expect(exportarGrupoCSV).toHaveBeenCalledTimes(1);
  });
});
