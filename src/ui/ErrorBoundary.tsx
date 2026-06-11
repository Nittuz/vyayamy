import { Component, type ReactNode, useMemo } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { captureException } from '@/lib/errorReporting';

import { useTheme, type Theme } from './useTheme';

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
    // The fallback is a function component so it can read the active skin/scheme
    // via useTheme — the class itself can't use hooks. (Was pinned to the dark
    // palette, broken in light mode and the other skins, #23.)
    return <ErrorFallback message={this.state.error.message} onReset={this.reset} />;
  }
}

function ErrorFallback({ message, onReset }: { message: string; onReset: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Something broke</Text>
        <Text style={styles.message}>{message}</Text>
        <Pressable onPress={onReset} style={styles.btn} accessibilityRole="button">
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
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
      fontSize: theme.font.size.title,
      fontFamily: theme.font.family.sansSemibold,
      fontWeight: theme.font.weight.semibold,
      color: theme.color.ink,
    },
    message: {
      fontSize: theme.font.size.meta,
      fontFamily: theme.font.family.sans,
      color: theme.color.inkSecondary,
    },
    btn: {
      marginTop: theme.space.s2,
      backgroundColor: theme.color.accent,
      paddingVertical: theme.space.s3,
      borderRadius: theme.radius.sm,
      alignItems: 'center',
    },
    btnText: {
      color: theme.color.onAccent,
      fontSize: theme.font.size.body,
      fontFamily: theme.font.family.sansSemibold,
      fontWeight: theme.font.weight.semibold,
    },
  });
