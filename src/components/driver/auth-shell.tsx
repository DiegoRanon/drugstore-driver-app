import Ionicons from '@expo/vector-icons/Ionicons';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '@/components/driver/chrome';
import { LocaleToggle, SegmentedControl, ThemeToggle } from '@/components/driver/inputs';
import { useTheme, useThemeMode } from '@/design/theme';
import { Space, Type } from '@/design/tokens';
import { useLocale, useStrings } from '@/locale/locale-provider';
import type { ErrorNotice } from '@/locale/error-message';

/**
 * The frame both entry screens share (PRD §4.2).
 *
 * Sign-in and invite registration are two routes, not two states of one screen:
 * they ask for different things, fail for different reasons, and a driver
 * arriving with a printed code should be able to land on the code screen
 * directly. The segmented control at the top navigates between them, so the
 * pairing still reads as one choice even though the URL changes.
 */

export type AuthMode = 'signIn' | 'invite';

export function AuthShell({
  mode,
  onChangeMode,
  notice,
  children,
}: {
  mode: AuthMode;
  onChangeMode: (next: AuthMode) => void;
  notice: ErrorNotice | null;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const t = useStrings();
  const { locale, setLocale } = useLocale();
  const { mode: themeMode, setMode } = useThemeMode();

  return (
    <KeyboardAvoidingView
      style={styles.root}
      // The password field sits low on the screen; without this the keyboard
      // covers the submit button on shorter phones.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Space.lg, paddingBottom: insets.bottom + Space.xxl },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.toolbar}>
          <LocaleToggle locale={locale} onChange={setLocale} />
          <ThemeToggle
            mode={themeMode}
            onChange={setMode}
            labels={{ dark: t.themeDark, light: t.themeLight }}
          />
        </View>

        <View style={styles.brand}>
          <View style={[styles.mark, { backgroundColor: theme.palette.accent }]}>
            <Ionicons name="medkit" size={28} color={theme.palette.onAccent} />
          </View>
          <Text style={[styles.tagline, { color: theme.ink.secondary }]}>{t.tagline}</Text>
        </View>

        <SegmentedControl<AuthMode>
          options={[
            { key: 'signIn', label: t.signIn },
            { key: 'invite', label: t.inviteCode },
          ]}
          value={mode}
          onChange={onChangeMode}
        />

        {notice ? (
          <View style={styles.notice}>
            <Banner tone="danger" icon="alert-circle-outline" message={notice.message} />
            {notice.reference ? (
              // The request id is the handle support uses against server logs
              // (PRD §8.3). Small, selectable, never the headline.
              <Text
                selectable
                style={[styles.reference, { color: theme.ink.tertiary }]}>
                {notice.reference}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.form}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: Space.lg,
    gap: Space.lg,
    flexGrow: 1,
  },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { alignItems: 'center', gap: Space.md, paddingVertical: Space.lg },
  mark: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagline: { ...Type.meta, textAlign: 'center', maxWidth: 280 },
  notice: { gap: 6 },
  reference: { ...Type.label, paddingHorizontal: Space.xs },
  form: { gap: Space.lg },
});
