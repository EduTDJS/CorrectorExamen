const DEFAULT_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 20000);

const PROVIDER_ERRORS = {
  CONFIG: 'provider_config_error',
  TIMEOUT: 'provider_timeout',
  UPSTREAM: 'provider_upstream_error',
  CONTRACT: 'provider_contract_error',
  PAYLOAD: 'payload_validation_error',
  CIRCUIT_OPEN: 'provider_circuit_open'
};

class ProviderIntegrationError extends Error {
  constructor(message, { status = 502, code = PROVIDER_ERRORS.UPSTREAM, provider } = {}) {
    super(message);
    this.name = 'ProviderIntegrationError';
    this.status = status;
    this.code = code;
    this.provider = provider;
  }
}

const buildPrompt = ({ datos, puntaje }) => ([
  'Eres una profesora experta en contabilidad y evaluación formativa.',
  `Materia: ${datos.materia}`,
  `Grupo: ${datos.grupo}`,
  `Fecha: ${datos.fecha}`,
  `Total de preguntas: ${datos.totalPreguntas}`,
  `Puntaje automático actual: ${Number(puntaje).toFixed(2)} / 100`,
  'Responde SOLO JSON: {"puntuacion_sugerida": number, "justificacion_breve": "texto"}'
].join('\n'));

const extraerJsonDeTexto = (texto = '') => {
  const input = String(texto).trim();
  if (!input) {
    throw new ProviderIntegrationError('El proveedor devolvió texto vacío.', { code: PROVIDER_ERRORS.CONTRACT });
  }

  try {
    return JSON.parse(input);
  } catch {
    const inicio = input.indexOf('{');
    const fin = input.lastIndexOf('}');
    if (inicio === -1 || fin === -1 || fin <= inicio) {
      throw new ProviderIntegrationError('No se encontró un bloque JSON válido en la respuesta del proveedor.', { code: PROVIDER_ERRORS.CONTRACT });
    }

    try {
      return JSON.parse(input.slice(inicio, fin + 1));
    } catch {
      throw new ProviderIntegrationError('La respuesta del proveedor no contiene JSON parseable.', { code: PROVIDER_ERRORS.CONTRACT });
    }
  }
};

const normalizarContrato = ({ provider, model, rawJson }) => {
  const puntuacion = Number(rawJson?.puntuacion_sugerida);
  const justificacion = String(rawJson?.justificacion_breve || '').trim();

  if (!Number.isFinite(puntuacion) || puntuacion < 0 || puntuacion > 100) {
    throw new ProviderIntegrationError('La puntuación devuelta por IA está fuera de rango (0-100).', { code: PROVIDER_ERRORS.CONTRACT, provider });
  }

  if (!justificacion) {
    throw new ProviderIntegrationError('La justificación devuelta por IA está vacía.', { code: PROVIDER_ERRORS.CONTRACT, provider });
  }

  return {
    puntuacion: puntuacion.toFixed(2),
    justificacion,
    proveedor: provider,
    modelo: model
  };
};

const fetchWithTimeout = async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ProviderIntegrationError(`La solicitud al proveedor excedió el tiempo límite (${timeoutMs / 1000}s).`, {
        status: 504,
        code: PROVIDER_ERRORS.TIMEOUT
      });
    }

    throw new ProviderIntegrationError(error?.message || 'No se pudo conectar con el proveedor de IA.');
  } finally {
    clearTimeout(timeoutId);
  }
};

class AnthropicProvider {
  constructor() {
    this.name = 'anthropic';
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
  }

  validateConfig() {
    if (!this.apiKey) {
      throw new ProviderIntegrationError('ANTHROPIC_API_KEY no está configurada en el servidor.', {
        status: 500,
        code: PROVIDER_ERRORS.CONFIG,
        provider: this.name
      });
    }
  }

  async suggestGrade({ datos, puntaje }, timeoutMs) {
    this.validateConfig();
    const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 250,
        temperature: 0.2,
        messages: [{ role: 'user', content: buildPrompt({ datos, puntaje }) }]
      })
    }, timeoutMs);

    const data = await response.json();
    if (!response.ok) {
      throw new ProviderIntegrationError(data?.error?.message || 'Error inesperado al consultar Anthropic.', {
        status: response.status,
        code: PROVIDER_ERRORS.UPSTREAM,
        provider: this.name
      });
    }

    const textoIa = (data?.content || [])
      .filter((bloque) => bloque?.type === 'text')
      .map((bloque) => bloque?.text || '')
      .join('\n');

    return normalizarContrato({ provider: this.name, model: this.model, rawJson: extraerJsonDeTexto(textoIa) });
  }
}

class OpenAIProvider {
  constructor() {
    this.name = 'openai';
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  validateConfig() {
    if (!this.apiKey) {
      throw new ProviderIntegrationError('OPENAI_API_KEY no está configurada en el servidor.', {
        status: 500,
        code: PROVIDER_ERRORS.CONFIG,
        provider: this.name
      });
    }
  }

  async suggestGrade({ datos, puntaje }, timeoutMs) {
    this.validateConfig();
    const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: buildPrompt({ datos, puntaje }) }]
      })
    }, timeoutMs);

    const data = await response.json();
    if (!response.ok) {
      throw new ProviderIntegrationError(data?.error?.message || 'Error inesperado al consultar OpenAI.', {
        status: response.status,
        code: PROVIDER_ERRORS.UPSTREAM,
        provider: this.name
      });
    }

    const textoIa = data?.choices?.[0]?.message?.content || '';
    return normalizarContrato({ provider: this.name, model: this.model, rawJson: extraerJsonDeTexto(textoIa) });
  }
}

const createProvider = (providerName) => {
  if (providerName === 'anthropic') return new AnthropicProvider();
  if (providerName === 'openai') return new OpenAIProvider();
  throw new ProviderIntegrationError(`AI_PROVIDER inválido: "${providerName}". Usa "anthropic" u "openai".`, {
    status: 500,
    code: PROVIDER_ERRORS.CONFIG,
    provider: providerName
  });
};

const parseErrorCodes = (rawValue) => String(rawValue || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const createProviderOrchestrator = ({ onEvent = () => {} } = {}) => {
  const timeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const primaryName = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  const secondaryName = String(process.env.AI_PROVIDER_SECONDARY || '').trim().toLowerCase();
  const fallbackEnabled = process.env.AI_FALLBACK_ENABLED !== 'false';
  const fallbackRetries = Math.max(0, Number(process.env.AI_FALLBACK_RETRIES || 1));
  const fallbackErrorCodes = parseErrorCodes(
    process.env.AI_FALLBACK_ERROR_CODES || `${PROVIDER_ERRORS.TIMEOUT},${PROVIDER_ERRORS.UPSTREAM}`
  );
  const circuitFailureThreshold = Math.max(1, Number(process.env.AI_CIRCUIT_FAILURE_THRESHOLD || 3));
  const circuitOpenMs = Math.max(1000, Number(process.env.AI_CIRCUIT_OPEN_MS || 30000));

  const providers = {
    [primaryName]: createProvider(primaryName)
  };
  if (secondaryName && secondaryName !== primaryName && fallbackEnabled) {
    providers[secondaryName] = createProvider(secondaryName);
  }

  const circuits = Object.keys(providers).reduce((acc, key) => {
    acc[key] = { state: 'closed', failures: 0, openedAt: 0 };
    return acc;
  }, {});

  const metrics = {
    failovers: 0,
    providerErrors: Object.keys(providers).reduce((acc, key) => ({ ...acc, [key]: 0 }), {}),
    circuitOpenEvents: Object.keys(providers).reduce((acc, key) => ({ ...acc, [key]: 0 }), {})
  };

  const shouldFallback = (error) => fallbackErrorCodes.includes(String(error?.code || '').toLowerCase());

  const allowAttempt = (providerName) => {
    const circuit = circuits[providerName];
    const now = Date.now();
    if (circuit.state === 'open') {
      if (now - circuit.openedAt >= circuitOpenMs) {
        circuit.state = 'half_open';
        onEvent({ event: 'provider_circuit_half_open', provider: providerName, circuitState: circuit.state });
        return;
      }

      throw new ProviderIntegrationError(`Circuito abierto para proveedor ${providerName}.`, {
        status: 503,
        code: PROVIDER_ERRORS.CIRCUIT_OPEN,
        provider: providerName
      });
    }
  };

  const markFailure = (providerName, error) => {
    const circuit = circuits[providerName];
    circuit.failures += 1;
    metrics.providerErrors[providerName] += 1;

    const shouldOpen = circuit.state === 'half_open' || circuit.failures >= circuitFailureThreshold;
    if (shouldOpen) {
      circuit.state = 'open';
      circuit.openedAt = Date.now();
      metrics.circuitOpenEvents[providerName] += 1;
      onEvent({
        event: 'provider_circuit_opened',
        provider: providerName,
        circuitState: circuit.state,
        errorCode: error?.code
      });
    }
  };

  const markSuccess = (providerName) => {
    const circuit = circuits[providerName];
    if (circuit.state !== 'closed') {
      onEvent({ event: 'provider_circuit_closed', provider: providerName, circuitState: 'closed' });
    }
    circuit.state = 'closed';
    circuit.failures = 0;
    circuit.openedAt = 0;
  };

  const runWithCircuit = async (providerName, payload) => {
    allowAttempt(providerName);
    const provider = providers[providerName];
    try {
      const response = await provider.suggestGrade(payload, timeoutMs);
      markSuccess(providerName);
      return response;
    } catch (error) {
      const normalized = error instanceof ProviderIntegrationError
        ? error
        : new ProviderIntegrationError(error?.message || 'Error de proveedor.', { provider: providerName });
      if (!normalized.provider) normalized.provider = providerName;
      markFailure(providerName, normalized);
      throw normalized;
    }
  };

  const suggestGrade = async (payload, context = {}) => {
    const attempts = [];
    const primaryProvider = providers[primaryName];
    const secondaryProvider = secondaryName ? providers[secondaryName] : null;

    const tryProvider = async (providerName) => {
      const result = await runWithCircuit(providerName, payload);
      return { result, provider: providers[providerName], providerName };
    };

    let primaryError;
    for (let i = 0; i <= fallbackRetries; i += 1) {
      try {
        const success = await tryProvider(primaryName);
        onEvent({
          event: 'provider_success',
          provider: success.providerName,
          model: success.provider.model,
          ...context
        });
        return success.result;
      } catch (error) {
        primaryError = error;
        attempts.push({ provider: primaryName, errorCode: error.code, attempt: i + 1 });
        if (i >= fallbackRetries || !shouldFallback(error)) {
          break;
        }
      }
    }

    if (secondaryProvider && primaryError && shouldFallback(primaryError)) {
      metrics.failovers += 1;
      onEvent({
        event: 'provider_failover',
        from: primaryName,
        to: secondaryName,
        errorCode: primaryError.code,
        metrics,
        ...context
      });
      const secondarySuccess = await tryProvider(secondaryName);
      onEvent({
        event: 'provider_success',
        provider: secondarySuccess.providerName,
        model: secondarySuccess.provider.model,
        ...context
      });
      return secondarySuccess.result;
    }

    onEvent({
      event: 'provider_failed',
      provider: primaryName,
      errorCode: primaryError?.code,
      attempts,
      metrics,
      ...context
    });
    throw primaryError;
  };

  return {
    suggestGrade,
    getPrimaryProvider: () => providers[primaryName],
    getStatus: () => ({
      primary: providers[primaryName] ? { name: providers[primaryName].name, model: providers[primaryName].model } : null,
      secondary: secondaryName && providers[secondaryName]
        ? { name: providers[secondaryName].name, model: providers[secondaryName].model }
        : null,
      timeoutMs,
      fallback: {
        enabled: fallbackEnabled,
        retries: fallbackRetries,
        errorCodes: fallbackErrorCodes
      },
      metrics
    }),
    errors: PROVIDER_ERRORS
  };
};

export { ProviderIntegrationError, PROVIDER_ERRORS, createProviderOrchestrator };
