import { fireEvent, render, screen } from '@testing-library/react';
import StepRevision from './StepRevision';

const baseProps = {
  resultadoRevision: { aciertos: 1, errores: 1, porcentaje: 50, puntaje: 50 },
  mapearLetraPucmm: () => 'C',
  sugerirCalificacionConIA: vi.fn(),
  iaEstado: { cargando: false, proveedorActivo: 'mock', modeloActivo: 'mock-1', error: '' },
  desglosePreguntas: [
    {
      numero: 1,
      respuestaCorrecta: 'A',
      respuestaEstudiante: 'A',
      correcta: true,
      confianzaOCR: 45,
      fuenteOCR: 'Línea 1',
      puntaje: 50,
      bajaConfianza: true,
      desglose: {
        criterioAplicado: 'Coincidencia',
        evidencia: { clave: 'A', respuestaEstudiante: 'A', estado: 'correcta', confianzaOCR: 45, fuente: 'Línea 1' },
        resultado: 'Correcta',
        recomendacion: 'Revisar manualmente'
      }
    },
    {
      numero: 2,
      respuestaCorrecta: 'B',
      respuestaEstudiante: 'C',
      correcta: false,
      confianzaOCR: 92,
      fuenteOCR: 'Línea 2',
      puntaje: 0,
      bajaConfianza: false,
      desglose: {
        criterioAplicado: 'No coincide',
        evidencia: { clave: 'B', respuestaEstudiante: 'C', estado: 'incorrecta', confianzaOCR: 92, fuente: 'Línea 2' },
        resultado: 'Incorrecta',
        recomendacion: 'Sin cambios'
      }
    }
  ],
  overridesDocente: {},
  onOverrideDocente: vi.fn(),
  checklistBajaConfianza: {},
  onConfirmarRevisionBajaConfianza: vi.fn(),
  onEditarRespuestaBajaConfianza: vi.fn(),
  resumenBajaConfianzaRevision: { total: 1, revisadas: 0, pendientes: 1 },
  errorRevisionBajaConfianza: 'Debe confirmar primero.'
};

describe('StepRevision', () => {
  it('muestra badge de revisión y acciones rápidas para baja confianza', () => {
    render(<StepRevision {...baseProps} />);

    expect(screen.getByText(/Checklist baja confianza:/)).toBeInTheDocument();
    expect(screen.getByText(/Pendientes 1/)).toBeInTheDocument();
    expect(screen.getByText('Debe confirmar primero.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm as read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar respuesta' }));

    expect(baseProps.onConfirmarRevisionBajaConfianza).toHaveBeenCalledWith(1);
    expect(baseProps.onEditarRespuestaBajaConfianza).toHaveBeenCalledWith(1);
  });
});
