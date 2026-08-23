import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryAction } from '@/components/driver/actions';
import { AuthShell } from '@/components/driver/auth-shell';
import { Banner } from '@/components/driver/chrome';
import { GlassField } from '@/components/driver/inputs';
import { useSession } from '@/auth/session-provider';
import { useTheme } from '@/design/theme';
import { Space, Type } from '@/design/tokens';
import { errorNotice, type ErrorNotice } from '@/locale/error-message';
import { useStrings } from '@/locale/locale-provider';

/**
 * Sign in.
 *
 * No `router.replace` on success: the session flips, the root layout's guard
 * flips with it, and the navigator swaps the whole group. Navigating by hand
 * here would race that and briefly show the queue to a driver whose token had
 * already been rejected.
 */
export default function SignInScreen() {
  const router = useRouter();
  const t = useStrings();
  const theme = useTheme();
  const { signIn, state, acknowledgeEnded } = useSession();
  const params = useLocalSearchParams<{ registered?: string }>();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ErrorNotice | null>(null);

  // Why the driver is looking at this screen, when they did not choose to be:
  // a revoked token family, or a pharmacy that deactivated them mid-shift.
  const endedReason = state.status === 'signed-out' ? state.endedReason : null;

  // Clear the notice once it has been read, so it does not outlive the reason
  // for it and reappear on a later sign-out.
  useEffect(() => {
    return () => acknowledgeEnded();
  }, [acknowledgeEnded]);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setNotice(null);
    try {
      await signIn({ email: email.trim(), password });
      // Success intentionally does nothing else — the guard handles it.
    } catch (error) {
      setNotice(errorNotice(error, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      mode="signIn"
      onChangeMode={(next) => {
        if (next === 'invite') router.push('/register');
      }}
      notice={notice}>
      {endedReason ? (
        <Banner
          tone="caution"
          icon="information-circle-outline"
          message={
            endedReason === 'ACCOUNT_DISABLED'
              ? t.sessionEnded.ACCOUNT_DISABLED
              : t.sessionEnded.DEFAULT
          }
        />
      ) : null}

      {params.registered === '1' ? (
        <Banner tone="accent" icon="checkmark-circle-outline" message={t.registered} />
      ) : null}

      <GlassField
        label={t.driverId}
        value={email}
        onChangeText={setEmail}
        placeholder={t.emailPlaceholder}
        keyboardType="email-address"
        autoComplete="email"
        icon="mail-outline"
      />

      <GlassField
        label={t.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        icon="lock-closed-outline"
      />

      <PrimaryAction
        label={busy ? t.signingIn : t.signIn}
        onPress={submit}
        disabled={!canSubmit}
        loading={busy}
        icon={<Ionicons name="log-in-outline" size={20} color={theme.palette.onAccent} />}
      />

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.ink.tertiary }]}>
          {t.registerIntro}
        </Text>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  footer: { alignItems: 'center', paddingTop: Space.sm },
  footerText: { ...Type.meta, textAlign: 'center', maxWidth: 300 },
});
