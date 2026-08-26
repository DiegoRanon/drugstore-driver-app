/**
 * The HTML shell wrapped around the web bundle, and the only file in the app
 * that renders real DOM.
 *
 * It exists for one reason: the pilot ships this app as a web page rather than
 * a store build, so the browser has to be talked into behaving like an app.
 * "Add to Home Screen" reads the manifest and the Apple meta tags below, and
 * gives a driver a full-screen icon with no URL bar — which is as close to the
 * native surface as the pilot gets.
 *
 * Runs in Node at export time, never in the browser. Nothing here may touch
 * `window`, and no runtime state belongs in it — this is the static frame, and
 * `_layout.tsx` is where the app actually starts.
 */
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Painted before a single line of JavaScript runs, so the page opens on the
 * app's own field instead of a white flash. The two values are `base` from the
 * dark and light themes (src/design/theme.ts) — keep them in step.
 */
const PRELOAD_BACKGROUND = `
html, body, #root { background-color: #F4FAF8; }
@media (prefers-color-scheme: dark) {
  html, body, #root { background-color: #060912; }
}
#root { display: flex; min-height: 100%; }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <title>Livramed Driver</title>
        {/*
          `viewport-fit=cover` lets the layout reach under the notch and the
          home indicator once the app is installed to the home screen; the safe
          areas are already handled by react-native-safe-area-context.

          Zoom is deliberately left enabled — a driver squinting at a street
          number in a car should be able to pinch it larger.
        */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />

        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <meta name="theme-color" content="#F4FAF8" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#060912" media="(prefers-color-scheme: dark)" />

        {/* iOS reads its own tags rather than the manifest for standalone mode. */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Driver" />

        {/*
          This page is a door to patient addresses. It has no business in a
          search index, and the referrer must not carry our origin to whatever
          a driver taps next.
        */}
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />

        {/* Keeps body scroll off the document so only ScrollViews scroll. */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: PRELOAD_BACKGROUND }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
