import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useMeshTarget } from '@/components/glass/mesh-background';
import { useTheme, type GlassLevel, type TintName } from '@/design/theme';
import { Radius } from '@/design/tokens';

type GlassPanelProps = PropsWithChildren<{
  /** How far forward the surface sits. See `glass` in theme.ts. */
  level?: GlassLevel;
  /** Status colouring. Replaces the neutral fill and border, keeps the blur. */
  tint?: TintName;
  radius?: number;
  /**
   * Real backdrop blur on Android.
   *
   * Off by default because each Android `BlurView` is a live render pass — fine
   * for the handful of chrome surfaces, ruinous for forty list rows. Those fall
   * back to the fill alone, which is why every fill is opaque enough to stand
   * on its own.
   */
  androidBlur?: boolean;
  /** Card lift. On by default; the day theme needs it to separate white on white. */
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}>;

/**
 * The single glass surface used by every card, sheet, chip, and bar.
 *
 * Four layers, in order: blurred backdrop, fill, hairline rim, and a brighter
 * arc along the top edge. That last one is what sells the night theme — a real
 * pane catches light on the edge facing the source. By day the same slot holds
 * a soft white highlight and the separation comes mostly from the shadow.
 */
export function GlassPanel({
  level = 'row',
  tint,
  radius = Radius.card,
  androidBlur = false,
  elevated = true,
  style,
  contentStyle,
  children,
}: GlassPanelProps) {
  const theme = useTheme();
  const recipe = theme.glass[level];
  const skin = tint ? theme.tint[tint] : { fill: recipe.fill, border: recipe.border };
  const meshTarget = useMeshTarget();
  const blurs = Platform.OS !== 'android' || androidBlur;

  // Two views, not one: iOS drops a shadow entirely when the same view clips
  // with `overflow: hidden`, and the blur needs that clip to respect the
  // radius. So the outer view casts and the inner view clips.
  return (
    <View style={[{ borderRadius: radius }, elevated && theme.shadow, style]}>
      <View style={[styles.clip, { borderRadius: radius, borderColor: skin.border }]}>
        {blurs ? (
          <BlurView
            pointerEvents="none"
            intensity={recipe.blur}
            tint={theme.scheme}
            blurMethod={Platform.OS === 'android' ? 'dimezisBlurViewSdk31Plus' : undefined}
            blurTarget={meshTarget ?? undefined}
            blurReductionFactor={2}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: skin.fill }]}
        />

        <LinearGradient
          pointerEvents="none"
          colors={['transparent', recipe.edge, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.edge}
        />

        <View style={contentStyle}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  edge: {
    position: 'absolute',
    top: 0,
    left: '12%',
    right: '12%',
    height: 1,
  },
});
