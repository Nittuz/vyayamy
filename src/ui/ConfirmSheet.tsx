/**
 * ConfirmSheet — the confirm/destructive decision surface, built on Sheet's
 * center variant. Replaces `Alert.alert` for decisions so confirms are themed,
 * animated, and consistent (toasts stay `useToast`, transient only).
 */
import { Button } from './Button';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { useTheme } from './useTheme';

export interface ConfirmSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export function ConfirmSheet({
  visible,
  onClose,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}: ConfirmSheetProps) {
  const theme = useTheme();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      variant="center"
      footer={
        <>
          <Button
            label={confirmLabel}
            kind={destructive ? 'danger' : 'primary'}
            size="row"
            onPress={() => {
              onClose();
              onConfirm();
            }}
          />
          <Button label={cancelLabel} kind="ghost" size="row" onPress={onClose} />
        </>
      }
    >
      {message ? (
        <Text variant="body" color={theme.color.inkSecondary}>
          {message}
        </Text>
      ) : null}
    </Sheet>
  );
}
