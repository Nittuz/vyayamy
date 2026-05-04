import { Component, type ReactNode } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { captureException } from '@/lib/errorReporting';
import { theme } from './theme';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error) {
    captureException(error, { boundary: 'root' });
  }

  reset = () => this.setState({ error: null });

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Something broke</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Pressable onPress={this.reset} style={styles.btn}>
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.bg,
    padding: theme.space.page,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: theme.color.surface,
    padding: theme.space.s6,
    borderRadius: theme.radius.md,
    gap: theme.space.s3,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  title: {
    fontSize: theme.font.section,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.text,
  },
  message: { fontSize: theme.font.meta, color: theme.color.textSecondary },
  btn: {
    marginTop: theme.space.s2,
    backgroundColor: theme.color.accent,
    paddingVertical: theme.space.s3,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
  },
  btnText: {
    color: theme.color.onAccent,
    fontSize: theme.font.body,
    fontWeight: theme.font.weight.semibold,
  },
});
