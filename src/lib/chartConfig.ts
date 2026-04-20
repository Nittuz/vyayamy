export const CHART_TICK = { fontSize: 11, fill: 'var(--color-chart-axis)' };

export const CHART_MARGIN = { top: 8, right: 4, left: -20, bottom: 0 };

export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  boxShadow: 'var(--shadow-md)',
  fontSize: 'var(--font-meta)',
  padding: 'var(--space-2) var(--space-3)',
};

export const CHART_TOOLTIP_LABEL: React.CSSProperties = {
  color: 'var(--color-text-secondary)',
  marginBottom: 2,
};

export const CHART_CURSOR = { stroke: 'var(--color-border-strong)', strokeWidth: 1 };

export const CHART_ACTIVE_DOT = {
  r: 3.5,
  fill: 'var(--color-accent)',
  strokeWidth: 0,
};

export const CHART_PR_DOT = {
  r: 4,
  fill: 'var(--color-pr)',
  strokeWidth: 0,
};

export const CHART_REFERENCE_LINE = {
  stroke: 'var(--color-border)',
  strokeDasharray: '3 3',
  strokeWidth: 1,
};
