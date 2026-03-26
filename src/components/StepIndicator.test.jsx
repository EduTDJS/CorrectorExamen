import { render, screen } from '@testing-library/react';

import StepIndicator from './StepIndicator';

describe('StepIndicator', () => {
  it('renderiza los pasos y marca el paso actual', () => {
    render(<StepIndicator pasos={['Configurar', 'Revisar', 'Reporte']} pasoActual={1} />);

    expect(screen.getByText('1. Configurar')).toBeInTheDocument();
    expect(screen.getByText('2. Revisar')).toHaveClass('activo');
    expect(screen.getByText('3. Reporte')).toBeInTheDocument();
  });
});
