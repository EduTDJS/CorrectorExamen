import { obtenerProveedorIA, sugerirCalificacionIA } from './aiService';
import { limpiarSesion, establecerTokenSesion } from './sessionService';

describe('aiService', () => {
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

  it('normaliza el contrato de sugerencia y recorta justificación', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        puntuacion: '91.567',
        justificacion: '  Correcto y consistente  ',
        proveedor: 'openai',
        modelo: 'gpt-4o-mini'
      })
    });

    await expect(sugerirCalificacionIA({ datos: {}, puntaje: 75 })).resolves.toEqual({
      puntuacion: '91.57',
      justificacion: 'Correcto y consistente',
      proveedor: 'openai',
      modelo: 'gpt-4o-mini'
    });
  });

  it('mapea errores de autorización y cuota al mensaje esperado', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: { code: 'auth_unauthorized', provider: 'openai' } })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({ error: { code: 'auth_forbidden', provider: 'openai' } })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: vi.fn().mockResolvedValue({ error: { code: 'rate_limit_exceeded', provider: 'anthropic' } })
      });

    await expect(sugerirCalificacionIA({ datos: {}, puntaje: 80 })).rejects.toMatchObject({
      status: 401,
      message: 'Tu sesión expiró o es inválida. Inicia sesión nuevamente para continuar.'
    });
    await expect(sugerirCalificacionIA({ datos: {}, puntaje: 80 })).rejects.toMatchObject({
      status: 403,
      message: 'No tienes permisos suficientes para solicitar sugerencias de IA.'
    });
    await expect(sugerirCalificacionIA({ datos: {}, puntaje: 80 })).rejects.toMatchObject({
      status: 429,
      provider: 'anthropic',
      message: 'Límite de cuota o tasa alcanzado en anthropic.'
    });
  });

  it('mapea errores de integración por código del proveedor', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ error: { code: 'provider_config_error', provider: 'openai' } })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 504,
        json: vi.fn().mockResolvedValue({ error: { code: 'provider_timeout', provider: 'anthropic' } })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: vi.fn().mockResolvedValue({ error: { code: 'provider_contract_error', provider: 'openai' } })
      });

    await expect(sugerirCalificacionIA({ datos: {}, puntaje: 80 })).rejects.toMatchObject({
      code: 'provider_config_error',
      message: 'Configuración incompleta del proveedor openai en servidor.'
    });
    await expect(sugerirCalificacionIA({ datos: {}, puntaje: 80 })).rejects.toMatchObject({
      code: 'provider_timeout',
      message: 'El proveedor anthropic superó el tiempo límite de respuesta.'
    });
    await expect(sugerirCalificacionIA({ datos: {}, puntaje: 80 })).rejects.toMatchObject({
      code: 'provider_contract_error',
      message: 'El proveedor openai respondió con un formato inválido.'
    });
  });

  it('falla cuando el backend responde contrato inválido', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        puntuacion: 120,
        justificacion: '  ',
        proveedor: 'openai'
      })
    });

    await expect(sugerirCalificacionIA({ datos: {}, puntaje: 80 })).rejects.toMatchObject({
      code: 'backend_contract_error',
      message: 'El backend devolvió una sugerencia de IA inválida.'
    });
  });

  it('obtiene proveedor activo y usa valores por defecto si faltan datos', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        proveedor: 'openai',
        modelo: 'gpt-4o-mini',
        timeoutMs: 20000
      })
    }).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({})
    });

    await expect(obtenerProveedorIA()).resolves.toEqual({
      proveedor: 'openai',
      modelo: 'gpt-4o-mini',
      timeoutMs: 20000
    });
    await expect(obtenerProveedorIA()).resolves.toEqual({
      proveedor: 'desconocido',
      modelo: 'desconocido',
      timeoutMs: 0
    });
  });

  it('lanza error tipado cuando falla obtenerProveedorIA', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockResolvedValue({
        error: {
          message: 'Servicio no disponible',
          code: 'provider_upstream_error',
          provider: 'openai'
        }
      })
    });

    await expect(obtenerProveedorIA()).rejects.toMatchObject({
      name: 'AIServiceError',
      status: 503,
      code: 'provider_upstream_error',
      provider: 'openai',
      message: 'Servicio no disponible'
    });
  });
});
