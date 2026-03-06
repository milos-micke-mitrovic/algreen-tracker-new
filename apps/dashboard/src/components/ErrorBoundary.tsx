import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { Button, Typography, Result } from 'antd';

const { Paragraph, Text } = Typography;

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
        <Result
          status="500"
          title="Došlo je do greške"
          subTitle="Nešto je pošlo po zlu. Pokušajte ponovo ili se vratite na početnu stranicu."
          extra={[
            <Button
              type="primary"
              key="reload"
              onClick={() => window.location.reload()}
            >
              Ponovo učitaj
            </Button>,
            <Button
              key="home"
              onClick={() => { window.location.href = '/'; }}
            >
              Početna
            </Button>,
          ]}
        >
          {import.meta.env.DEV && this.state.error && (
            <Paragraph>
              <Text strong style={{ fontSize: 14, color: '#cf1322' }}>
                {this.state.error.message}
              </Text>
              <pre style={{ marginTop: 8, fontSize: 12, color: '#666', maxHeight: 200, overflow: 'auto', background: '#f5f5f5', padding: 12, borderRadius: 6 }}>
                {this.state.error.stack}
              </pre>
            </Paragraph>
          )}
        </Result>
      </div>
    );
  }
}
