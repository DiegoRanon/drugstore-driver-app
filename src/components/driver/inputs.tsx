import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GlassPanel } from '@/components/glass/glass-panel';
import { useTheme } from '@/design/theme';
import { MonoFont, Radius, Space, TapTarget, Type } from '@/design/tokens';

/** Form surfaces for sign-in and invite registration (PRD §4.2). */

export function GlassField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoComplete,
  icon,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoComplete?: 'email' | 'password' | 'off';
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const [focused, setFocused] = useState(false);
  const theme = useTheme();
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: theme.ink.tertiary }]}>{label}</Text>
      <GlassPanel
        level={focused ? 'active' : 'row'}
        radius={Radius.control}
        elevated={false}
        contentStyle={styles.field}>
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={focused ? theme.palette.accent : theme.ink.tertiary}
          />
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={theme.ink.tertiary}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: theme.ink.primary }]}
          accessibilityLabel={label}
        />
      </GlassPanel>
    </View>
  );
}

/**
 * Eight characters from an alphabet without I, O, 0, or 1, typed off a printed
 * sheet: uppercase, monospace, and grouped 4+4 so a driver can check their
 * place without counting (PRD §4.2).
 */
export function InviteCodeField({
  label,
  value,
  onChangeText,
  onPaste,
  pasteLabel,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  onPaste?: () => void;
  pasteLabel: string;
}) {
  const [focused, setFocused] = useState(false);
  const theme = useTheme();
  const grouped = value.length > 4 ? `${value.slice(0, 4)} ${value.slice(4, 8)}` : value;

  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: theme.ink.tertiary }]}>{label}</Text>
      <GlassPanel
        level={focused ? 'active' : 'row'}
        radius={Radius.control}
        elevated={false}
        contentStyle={styles.field}>
        <TextInput
          value={grouped}
          onChangeText={(next) => onChangeText(next.replace(/\s/g, '').toUpperCase().slice(0, 8))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="XXXX XXXX"
          placeholderTextColor={theme.ink.tertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
          style={[styles.input, styles.codeInput, { color: theme.ink.primary }]}
          accessibilityLabel={label}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pasteLabel}
          onPress={onPaste}
          hitSlop={10}>
          <Ionicons name="clipboard-outline" size={18} color={theme.palette.accent} />
        </Pressable>
      </GlassPanel>
    </View>
  );
}

/** Sign in ⇄ Invite code, and any other two-way choice. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const theme = useTheme();
  return (
    <GlassPanel level="row" radius={Radius.chip} elevated={false} contentStyle={styles.segments}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.key)}
            style={[
              styles.segment,
              selected && { backgroundColor: theme.palette.accent },
            ]}>
            <Text
              style={[
                styles.segmentText,
                { color: selected ? theme.palette.onAccent : theme.ink.secondary },
              ]}
              numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </GlassPanel>
  );
}

/** French default, English a tap away (PRD §5.11). */
export function LocaleToggle({
  locale,
  onChange,
}: {
  locale: 'fr' | 'en';
  onChange: (next: 'fr' | 'en') => void;
}) {
  const theme = useTheme();
  return (
    <GlassPanel level="row" radius={Radius.chip} elevated={false} contentStyle={styles.locale}>
      {(['en', 'fr'] as const).map((option, index) => (
        <View key={option} style={styles.localeItem}>
          {index === 1 ? (
            <Text style={[styles.localeDivider, { color: theme.ink.tertiary }]}>|</Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: option === locale }}
            accessibilityLabel={option.toUpperCase()}
            onPress={() => onChange(option)}
            hitSlop={12}>
            <Text
              style={[
                styles.localeText,
                { color: option === locale ? theme.palette.accent : theme.ink.tertiary },
              ]}>
              {option.toUpperCase()}
            </Text>
          </Pressable>
        </View>
      ))}
    </GlassPanel>
  );
}

/**
 * Night / day.
 *
 * A real control, not a developer switch: the same van is dark at 6am in
 * January and full of glare at noon in July, and the driver is the only one who
 * knows which they are in.
 */
export function ThemeToggle({
  mode,
  onChange,
  labels,
}: {
  mode: 'dark' | 'light';
  onChange: (next: 'dark' | 'light') => void;
  labels: { dark: string; light: string };
}) {
  const theme = useTheme();
  const OPTIONS = [
    { key: 'light' as const, icon: 'sunny' as const, label: labels.light },
    { key: 'dark' as const, icon: 'moon' as const, label: labels.dark },
  ];

  return (
    <GlassPanel level="row" radius={Radius.chip} elevated={false} contentStyle={styles.segments}>
      {OPTIONS.map((option) => {
        const selected = option.key === mode;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.key)}
            style={[styles.themeSegment, selected && { backgroundColor: theme.palette.accent }]}>
            <Ionicons
              name={option.icon}
              size={16}
              color={selected ? theme.palette.onAccent : theme.ink.tertiary}
            />
          </Pressable>
        );
      })}
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  fieldGroup: { gap: 6 },
  fieldLabel: { ...Type.label, textTransform: 'uppercase' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    minHeight: TapTarget + 4,
  },
  input: { flex: 1, ...Type.body, paddingVertical: Space.md },
  codeInput: {
    fontFamily: MonoFont,
    fontSize: 22,
    letterSpacing: 6,
    fontWeight: '700',
  },
  segments: { flexDirection: 'row', padding: 4, gap: 4 },
  segment: {
    flex: 1,
    minHeight: TapTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.chip,
    paddingHorizontal: Space.md,
  },
  segmentText: { ...Type.chip, fontSize: 14 },
  themeSegment: {
    width: TapTarget - 8,
    height: TapTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.chip,
  },
  locale: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  localeItem: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  localeDivider: { marginHorizontal: Space.sm },
  localeText: { ...Type.chip, fontSize: 14, paddingHorizontal: 4 },
});
