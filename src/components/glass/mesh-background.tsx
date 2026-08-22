import { BlurTargetView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext, useRef, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';

/**
 * The light source for the whole app.
 *
 * Glass is only convincing when there is something coloured and uneven behind
 * it to refract, so the mesh is not decoration — it is what every `GlassPanel`
 * samples. At night it is a deep field with cyan and violet glow; by day the
 * same geometry, drawn at a third of the opacity over pale mint, so the page
 * reads as paper with light on it rather than as a tinted screen.
 *
 * Softness comes from geometry, not from a blur pass. An earlier version
 * feathered the blobs with one full-screen `BlurView`, which is correct on iOS
 * and catastrophic anywhere the blur falls back to a plain translucent view:
 * the fallback paints over the entire field and every screen washes out. Here
 * each blob is oversized and pushed mostly off-screen, so only its
 * colour-to-transparent tail is visible, and a vignette pulls the edges back.
 *
 * Android still needs the content it blurs declared explicitly, so the field
 * lives inside a `BlurTargetView` whose ref is published on `MeshTargetContext`
 * for the panels that do blur.
 */
const MeshTargetContext = createContext<React.RefObject<View | null> | null>(null);

export function useMeshTarget(): React.RefObject<View | null> | null {
  return useContext(MeshTargetContext);
}

type BlobProps = {
  color: string;
  size: number;
  opacity: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

function Blob({ color, size, opacity, ...position }: BlobProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.blob,
        position,
        { width: size, height: size, borderRadius: size / 2, opacity },
      ]}>
      <LinearGradient
        colors={[color, `${color}66`, `${color}00`]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.3, y: 0.15 }}
        end={{ x: 0.8, y: 0.95 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export function MeshBackground({ children }: PropsWithChildren) {
  const targetRef = useRef<View | null>(null);
  const { backdrop } = useTheme();
  const alpha = backdrop.blobOpacity;

  return (
    <View style={[styles.root, { backgroundColor: backdrop.base }]}>
      <BlurTargetView ref={targetRef} style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={[backdrop.deep, backdrop.base, backdrop.base]}
          locations={[0, 0.55, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <Blob color={backdrop.blobCyan} size={620} top={-320} right={-260} opacity={0.22 * alpha} />
        <Blob color={backdrop.blobIndigo} size={720} top={40} left={-380} opacity={0.24 * alpha} />
        <Blob
          color={backdrop.blobViolet}
          size={660}
          bottom={-320}
          right={-280}
          opacity={0.2 * alpha}
        />
        <Blob color={backdrop.blobTeal} size={520} bottom={60} left={-300} opacity={0.16 * alpha} />

        {/* Keeps the corners settled so the mesh reads as glow, not haze. */}
        <LinearGradient
          pointerEvents="none"
          colors={backdrop.vignette}
          locations={[0, 0.45, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </BlurTargetView>

      <MeshTargetContext.Provider value={targetRef}>{children}</MeshTargetContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  blob: { position: 'absolute', overflow: 'hidden' },
});
