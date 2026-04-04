import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
    await screen.findByLabelText('Respuestas del estudiante (A/B/C/D)');

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

  it('permite importar CSV y cargar una fila para corrección manual', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Materia'), { target: { value: 'Física I' } });
    fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: 'B-02' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-03-26' } });
    fireEvent.change(screen.getByLabelText('Nombre estudiante'), { target: { value: 'Temporal' } });
    fireEvent.change(screen.getByLabelText('Matrícula estudiante'), { target: { value: 'TMP' } });
    fireEvent.change(screen.getByLabelText('Total de preguntas'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Clave de respuestas (solo A/B/C/D)'), { target: { value: 'ABCD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByLabelText('Respuestas del estudiante (A/B/C/D)');

    const csv = [
      'estudianteNombre,estudianteMatricula,respuestas',
      'Ana Pérez,2026009,ABCD',
      'Erróneo,2026010,AXCD'
    ].join('\n');
    const file = new File([csv], 'import.csv', { type: 'text/csv' });

    fireEvent.change(screen.getByLabelText('Archivo de importación'), {
      target: { files: [file] }
    });

    expect(await screen.findByText(/Leídas: 2 · Válidas: 1 · Errores: 1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cargar fila 2 de Ana Pérez en el formulario/ }));

    expect(screen.getByLabelText('Respuestas del estudiante (A/B/C/D)')).toHaveValue('ABCD');

    const tablaRespuestas = screen.getAllByRole('table')[1];
    const filaPreguntaUno = within(tablaRespuestas).getByText('1').closest('tr');
    fireEvent.change(within(filaPreguntaUno).getByRole('combobox'), { target: { value: 'D' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Respuestas del estudiante (A/B/C/D)')).toHaveValue('DBCD');
    });
  });

  it('registra por lote filas válidas y muestra resumen de creados/actualizados/omitidos/fallidos', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Materia'), { target: { value: 'Química I' } });
    fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: 'C-03' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-03-26' } });
    fireEvent.change(screen.getByLabelText('Nombre estudiante'), { target: { value: 'Temporal' } });
    fireEvent.change(screen.getByLabelText('Matrícula estudiante'), { target: { value: 'TMP' } });
    fireEvent.change(screen.getByLabelText('Total de preguntas'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Clave de respuestas (solo A/B/C/D)'), { target: { value: 'ABCD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByLabelText('Respuestas del estudiante (A/B/C/D)');

    const csv = [
      'estudianteNombre,estudianteMatricula,respuestas',
      'Ana Pérez,2026101,ABCD',
      'Juan Díaz,2026102,ABCC'
    ].join('\n');
    const file = new File([csv], 'import.csv', { type: 'text/csv' });

    fireEvent.change(screen.getByLabelText('Archivo de importación'), {
      target: { files: [file] }
    });

    fireEvent.click(await screen.findByRole('button', { name: /Registrar todas las filas válidas importadas/ }));

    expect(await screen.findByText(/Registro por lote completado — Creados: 2 · Actualizados: 0 · Omitidos: 0 · Fallidos: 0/)).toBeInTheDocument();
  });

  it('carga plantilla de rúbrica y permite override manual docente', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Plantilla de rúbrica'), {
      target: { value: 'rubrica-matematicas-6to-v1' }
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Materia')).toHaveValue('Matemáticas');
      expect(screen.getByLabelText('Total de preguntas')).toHaveValue(4);
      expect(screen.getByLabelText('Clave de respuestas (solo A/B/C/D)')).toHaveValue('ABCD');
    });

    fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: 'A-01' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-03-26' } });
    fireEvent.change(screen.getByLabelText('Nombre estudiante'), { target: { value: 'Ana Pérez' } });
    fireEvent.change(screen.getByLabelText('Matrícula estudiante'), { target: { value: '2023001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    fireEvent.change(await screen.findByLabelText('Respuestas del estudiante (A/B/C/D)'), { target: { value: 'ABCD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    const overrideInput = await screen.findByLabelText('Override pregunta 1');
    fireEvent.change(overrideInput, { target: { value: '7' } });
    expect(await screen.findByText('7.00')).toBeInTheDocument();
  });

});
