import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 'var(--padding-page, 20px)', textAlign: 'center', marginTop: 80 }}>
          <h1 className="section-title" style={{ marginBottom: 8 }}>Something went wrong</h1>
          <p className="meta" style={{ marginBottom: 16 }}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button type="button" className="btn-primary" style={{ maxWidth: 200, margin: '0 auto' }} onClick={this.handleReset}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
