import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryAction } from '@/components/driver/actions';
import { AuthShell } from '@/components/driver/auth-shell';
import { GlassField, InviteCodeField } from '@/components/driver/inputs';
import { useSession } from '@/auth/session-provider';
import { useTheme } from '@/design/theme';
import { Space, Type } from '@/design/tokens';
import { errorNotice, type ErrorNotice } from '@/locale/error-message';
import { useStrings } from '@/locale/locale-provider';

/** The server's rule, mirrored so the driver hears about it before the round-trip. */
const MIN_PASSWORD_LENGTH = 12;
const CODE_LENGTH = 8;

/**
 * Registration by invite code (PRD §4.2).
 *
 * The three code failures get three different messages, which is the entire
 * reason this screen branches on `code` rather than showing the server's
 * prose: "invalid code" sent to a driver holding an *expired* code makes them
 * walk back to the pharmacist to reissue a code that was never the problem.
 */
export default function RegisterScreen() {
  const router = useRouter();
  const t = useStrings();
  const theme = useTheme();
  const { register, signIn } = useSession();

  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ErrorNotice | null>(null);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const canSubmit =
    code.length === CODE_LENGTH &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    !busy;

  async function paste() {
    const text = await Clipboard.getStringAsync();
    // Codes get copied out of an email with spaces, dashes, or a trailing
    // newline attached; the field only ever holds the eight characters.
    setCode(text.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, CODE_LENGTH));
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setNotice(null);

    const credentials = { email: email.trim(), password };

    try {
      await register({
        code,
        email: credentials.email,
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
    } catch (error) {
      setNotice(errorNotice(error, t));
      setBusy(false);
      return;
    }

    // The account exists now. Signing in with the credentials already in hand
    // saves re-typing a 12-character password on a phone; if it fails for any
    // reason the account is still created, so fall back to the sign-in screen
    // rather than reporting a registration error that did not happen.
    try {
      await signIn(credentials);
    } catch {
      router.replace('/sign-in?registered=1');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      mode="invite"
      onChangeMode={(next) => {
        if (next === 'signIn') router.back();
      }}
      notice={notice}>
      <Text style={[styles.intro, { color: theme.ink.secondary }]}>{t.registerIntro}</Text>

      <InviteCodeField
        label={t.codeLabel}
        value={code}
        onChangeText={setCode}
        onPaste={paste}
        pasteLabel={t.paste}
      />

      <View style={styles.row}>
        <View style={styles.rowItem}>
          <GlassField
            label={t.firstName}
            value={firstName}
            onChangeText={setFirstName}
            icon="person-outline"
          />
        </View>
        <View style={styles.rowItem}>
          <GlassField label={t.lastName} value={lastName} onChangeText={setLastName} />
        </View>
      </View>

      <GlassField
        label={t.driverId}
        value={email}
        onChangeText={setEmail}
        placeholder={t.emailPlaceholder}
        keyboardType="email-address"
        autoComplete="email"
        icon="mail-outline"
      />

      <View style={styles.passwordGroup}>
        <GlassField
          label={t.choosePassword}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="off"
          icon="lock-closed-outline"
        />
        <Text
          style={[
            styles.rule,
            { color: passwordTooShort ? theme.palette.danger : theme.ink.tertiary },
          ]}>
          {t.passwordRule}
        </Text>
      </View>

      <GlassField
        label={t.phoneOptional}
        value={phone}
        onChangeText={setPhone}
        icon="call-outline"
      />

      <PrimaryAction
        label={busy ? t.creatingAccount : t.createAccount}
        onPress={submit}
        disabled={!canSubmit}
        loading={busy}
        icon={<Ionicons name="person-add-outline" size={20} color={theme.palette.onAccent} />}
      />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  intro: { ...Type.meta },
  row: { flexDirection: 'row', gap: Space.md },
  rowItem: { flex: 1 },
  passwordGroup: { gap: 6 },
  rule: { ...Type.label, paddingHorizontal: Space.xs },
});
