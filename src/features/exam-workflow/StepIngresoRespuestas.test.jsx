import { fireEvent, render, screen } from '@testing-library/react';
import StepIngresoRespuestas from './StepIngresoRespuestas';

const crearFila = (indice) => ({
  fila: indice + 2,
  estudianteMatricula: `2026${String(indice).padStart(3, '0')}`,
  estudianteNombre: `Estudiante ${indice}`,
  respuestasTexto: 'ABCD',
  respuestasLista: []
});

const crearProps = (overrides = {}) => ({
  datos: { modoIngreso: 'transcripcion', archivoImagen: null },
  errores: {},
  actualizarDato: vi.fn(),
  textoManual: '',
  setRespuestasLista: vi.fn(),
  convertirTextoALista: vi.fn(),
  totalPreguntasNumero: 4,
  procesarImagenConOCR: vi.fn(),
  ocrEstado: { procesando: false, progreso: 0, error: '' },
  totalFilasTabla: 1,
  respuestasLista: [],
  actualizarRespuesta: vi.fn(),
  letrasValidas: ['A', 'B', 'C', 'D'],
  umbralBajaConfianza: 70,
  importacionEstado: {
    error: '',
    resumen: { totalLeidas: 30, totalValidas: 30, totalErrores: 0, totalDuplicados: 0 },
    duplicadosEnHistorial: [],
    filas: Array.from({ length: 30 }, (_, idx) => crearFila(idx)),
    errores: []
  },
  onArchivoImportacion: vi.fn(),
  onTextoImportacion: vi.fn(),
  onAplicarFilaImportada: vi.fn(),
  onRegistrarFilasImportadas: vi.fn(),
  resumenRegistroLote: null,
  estrategiaConflictoImportacion: 'omitir_existentes',
  onCambiarEstrategiaConflicto: vi.fn(),
  resumenEstrategiaImportacion: { creados: 20, actualizados: 0, omitidos: 10 },
  ...overrides
});

describe('StepIngresoRespuestas', () => {
  it('pagina la vista previa y permite registrar las filas visibles', () => {
    const onRegistrarFilasImportadas = vi.fn();
    render(<StepIngresoRespuestas {...crearProps({ onRegistrarFilasImportadas })} />);

    expect(screen.getByText('Estudiante 0')).toBeInTheDocument();
    expect(screen.queryByText('Estudiante 16')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('Estudiante 15')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Registrar solo las filas mostradas en la vista previa' }));
    const filasSeleccionadas = onRegistrarFilasImportadas.mock.calls[0][0];
    expect(filasSeleccionadas).toHaveLength(15);
    expect(filasSeleccionadas[0].estudianteNombre).toBe('Estudiante 15');
  });

  it('filtra por matrícula o nombre y ajusta filas por página', () => {
    render(<StepIngresoRespuestas {...crearProps()} />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por matrícula o nombre' }), {
      target: { value: '2026007' }
    });

    expect(screen.getByText('Estudiante 7')).toBeInTheDocument();
    expect(screen.queryByText('Estudiante 8')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Filas por página' }), {
      target: { value: '10' }
    });

    expect(screen.getByText('Mostrando 1 de 1 filas (filtradas de 30).')).toBeInTheDocument();
  });

  it('permite cambiar estrategia de conflicto y muestra resumen previo', () => {
    const onCambiarEstrategiaConflicto = vi.fn();
    render(<StepIngresoRespuestas {...crearProps({ onCambiarEstrategiaConflicto })} />);

    expect(screen.getByText('Según la estrategia: Creados 20 · Actualizados 0 · Omitidos 10')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Estrategia de conflicto' }), {
      target: { value: 'sobrescribir_por_matricula' }
    });
    expect(onCambiarEstrategiaConflicto).toHaveBeenCalledWith('sobrescribir_por_matricula');
  });

  it('resalta preguntas con confianza OCR por debajo del umbral', () => {
    render(
      <StepIngresoRespuestas
        {...crearProps({
          datos: { modoIngreso: 'imagen', archivoImagen: null },
          totalFilasTabla: 2,
          respuestasLista: [
            { respuesta: 'A', confianza: 60, fuenteLinea: 'OCR' },
            { respuesta: 'B', confianza: 95, fuenteLinea: 'OCR' }
          ]
        })}
      />
    );

    const filaBajaConfianza = screen.getByText('1').closest('tr');
    const filaAltaConfianza = screen.getByText('2').closest('tr');
    expect(filaBajaConfianza).toHaveClass('fila-baja-confianza');
    expect(filaAltaConfianza).not.toHaveClass('fila-baja-confianza');
  });
});
