import { sugerirCalificacionIA } from './aiService';
import { limpiarSesion, establecerTokenSesion } from './sessionService';

describe('aiService auth headers', () => {
  beforeEach(() => {
    limpiarSesion();
    vi.restoreAllMocks();
  });

  it('envía Authorization en sugerirCalificacionIA cuando hay sesión activa', async () => {
    establecerTokenSesion('token-ia-abc');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        puntuacion: 95,
        justificacion: 'Buen desempeño',
        proveedor: 'openai',
        modelo: 'gpt-4.1'
      })
    });

    await sugerirCalificacionIA({ datos: { materia: 'Historia' }, puntaje: 90 });

    expect(fetchMock).toHaveBeenCalledWith('/api/calificacion/sugerir', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-ia-abc',
        'Content-Type': 'application/json'
      })
    }));
  });
});
