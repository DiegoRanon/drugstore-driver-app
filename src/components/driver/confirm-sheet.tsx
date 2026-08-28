import { Modal, StyleSheet, Text, View } from 'react-native';

import { SecondaryAction } from '@/components/driver/actions';
import { MeshBackground } from '@/components/glass/mesh-background';
import { useTheme } from '@/design/theme';
import { Space, Type } from '@/design/tokens';

/**
 * Yes / no on something the driver cannot undo with a second tap.
 *
 * `Alert.alert` would be the obvious way to ask, and it is the wrong one here:
 * react-native-web has no implementation, so on the web build — which is how
 * this app is deployed — the press does nothing at all and the driver is left
 * tapping a dead control. A Modal renders on every platform we ship.
 */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} transparent>
      <MeshBackground>
        <View style={styles.root}>
          <View style={styles.heading}>
            <Text style={[styles.title, { color: theme.ink.primary }]}>{title}</Text>
            <Text style={[styles.body, { color: theme.ink.secondary }]}>{body}</Text>
          </View>
          <View style={styles.actions}>
            <SecondaryAction tone="danger" label={confirmLabel} onPress={onConfirm} />
            <SecondaryAction label={cancelLabel} onPress={onCancel} />
          </View>
        </View>
      </MeshBackground>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: Space.lg,
    paddingBottom: Space.xl,
    gap: Space.xl,
  },
  heading: { gap: Space.sm },
  title: { ...Type.display, fontSize: 26 },
  body: { ...Type.meta },
  actions: { gap: Space.sm },
});
