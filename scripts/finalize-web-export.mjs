/**
 * Post-processing for `expo export -p web`. Two fixes, both web-only, both
 * deliberately loud if the export ever stops looking the way they expect.
 *
 *   1. A 404 document. Static hosting serves `404.html` for an unmatched path;
 *      Expo names the same page `+not-found.html`. Copying it means a driver
 *      who mistypes a URL lands on the app's own "page could not be found"
 *      screen instead of the host's.
 *
 *   2. The empty `<title>`. Expo Router renders react-helmet-async on every
 *      page, and with no screen declaring a title it emits
 *      `<title data-rh="true"></title>` as the *first* element in `<head>`.
 *      Browsers read the first title, so that empty tag wins over the real one
 *      in `src/app/+html.tsx` and the tab shows a bare URL. Removing the
 *      helmet placeholder lets ours through.
 *
 * Run from `npm run build:web`, never by hand.
 */
import { readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../dist',
);

/** Exactly what helmet emits when nothing declared a title. */
const EMPTY_HELMET_TITLE = '<title data-rh="true"></title>';

async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return htmlFiles(full);
      return entry.name.endsWith('.html') ? [full] : [];
    }),
  );
  return files.flat();
}

const files = await htmlFiles(DIST);
if (files.length === 0) {
  throw new Error(`No HTML in ${DIST} — did the export run?`);
}

let stripped = 0;
for (const file of files) {
  const html = await readFile(file, 'utf8');
  if (!html.includes(EMPTY_HELMET_TITLE)) continue;
  await writeFile(file, html.replace(EMPTY_HELMET_TITLE, ''), 'utf8');
  stripped += 1;
}

if (stripped === 0) {
  // Either Expo changed the markup or a screen now sets its own title. Both
  // are fine outcomes, but this script is then lying about what it does.
  throw new Error(
    `Expected to strip "${EMPTY_HELMET_TITLE}" from the export and found it in none of ` +
      `${files.length} files. Check the <title> in the built index.html and update this script.`,
  );
}

await copyFile(path.join(DIST, '+not-found.html'), path.join(DIST, '404.html'));

console.log(
  `Web export finalized: title placeholder stripped from ${stripped}/${files.length} pages, 404.html written.`,
);
