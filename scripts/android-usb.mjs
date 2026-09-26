import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

const adb =
  process.env.ANDROID_HOME
    ? path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb.exe')
    : 'adb';

const args = process.argv.slice(2);
const shouldLaunch = args.includes('--launch');
const requestedSerial = args.find((argument) => !argument.startsWith('--'));
const devices = execFileSync(adb, ['devices'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.trim().split(/\s+/))
  .filter(([serial, state]) => serial && state === 'device');

const serial =
  requestedSerial ??
  devices.find(([deviceSerial]) => !deviceSerial.startsWith('emulator-'))?.[0];

if (!serial) {
  console.error('No connected physical Android device was found.');
  process.exit(1);
}

const result = spawnSync(
  adb,
  ['-s', serial, 'reverse', 'tcp:3000', 'tcp:3000'],
  { stdio: 'inherit' },
);

if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`USB API tunnel ready for ${serial}: phone localhost:3000 -> computer localhost:3000`);

if (shouldLaunch) {
  const launch = spawnSync(
    adb,
    [
      '-s',
      serial,
      'shell',
      'am',
      'start',
      '-n',
      'com.anonymous.medibusdriverapp/.MainActivity',
    ],
    { stdio: 'inherit' },
  );

  if (launch.status !== 0) process.exit(launch.status ?? 1);
}
