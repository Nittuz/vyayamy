/**
 * ConfirmSheet — the confirm/destructive decision surface, built on Sheet's
 * center variant. Replaces `Alert.alert` for decisions so confirms are themed,
 * animated, and consistent (toasts stay `useToast`, transient only).
 *
 * Risk weighting (impeccable r2 #I2): a destructive confirm leads with Cancel
 * at real weight (`secondary` — the panel plate) and puts the destructive
 * action second, quiet-but-marked (ghost + danger text + a hairline danger
 * border, via `Button kind="danger"` — the QuarantineBanner/syncRow idiom).
 * Non-destructive confirms are unchanged: primary action first, ghost cancel
 * second.
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
  const confirmButton = (
    <Button
      label={confirmLabel}
      kind={destructive ? 'danger' : 'primary'}
      size="row"
      onPress={() => {
        onClose();
        onConfirm();
      }}
    />
  );
  const cancelButton = (
    <Button
      label={cancelLabel}
      kind={destructive ? 'secondary' : 'ghost'}
      size="row"
      onPress={onClose}
    />
  );
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      variant="center"
      footer={
        destructive ? (
          <>
            {cancelButton}
            {confirmButton}
          </>
        ) : (
          <>
            {confirmButton}
            {cancelButton}
          </>
        )
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
