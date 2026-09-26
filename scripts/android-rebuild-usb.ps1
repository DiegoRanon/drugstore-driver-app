param(
  [string]$Serial
)

$ErrorActionPreference = 'Stop'

function Invoke-Checked {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE"
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$buildRoot = Join-Path $env:USERPROFILE 'dsapp'
$buildPackage = Join-Path $buildRoot 'package.json'

if (Test-Path $buildPackage) {
  $packageName = (Get-Content $buildPackage -Raw | ConvertFrom-Json).name
  if ($packageName -ne 'medibus-driver-app') {
    throw "Refusing to use $buildRoot because it belongs to another project."
  }
}

New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null

& robocopy $projectRoot $buildRoot /MIR `
  /XD node_modules android ios .git .expo dist `
  /NFL /NDL /NJH /NJS /NP
$robocopyExit = $LASTEXITCODE
if ($robocopyExit -gt 7) {
  throw "robocopy failed with exit code $robocopyExit"
}

Push-Location $buildRoot
try {
  Invoke-Checked 'npm.cmd' @('install', '--no-audit', '--no-fund')
  Invoke-Checked 'npx.cmd' @('expo', 'prebuild', '--platform', 'android', '--no-install')

  $gradlew = Join-Path $buildRoot 'android\gradlew.bat'
  Push-Location (Join-Path $buildRoot 'android')
  try {
    Invoke-Checked $gradlew @(
      'app:assembleRelease',
      '-PreactNativeArchitectures=arm64-v8a',
      '--max-workers=1',
      '--no-daemon'
    )
  } finally {
    Pop-Location
  }
} finally {
  Pop-Location
}

$adb = if ($env:ANDROID_HOME) {
  Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
} else {
  'adb'
}

$devices = & $adb devices |
  Select-Object -Skip 1 |
  Where-Object { $_ -match '^\S+\s+device$' } |
  ForEach-Object { ($_ -split '\s+')[0] } |
  Where-Object { -not $_.StartsWith('emulator-') }

if (-not $Serial) {
  if (@($devices).Count -ne 1) {
    throw 'Connect exactly one physical Android device, or pass its serial after --.'
  }
  $Serial = @($devices)[0]
}

$apk = Join-Path $buildRoot 'android\app\build\outputs\apk\release\app-release.apk'
Invoke-Checked $adb @('-s', $Serial, 'reverse', 'tcp:3000', 'tcp:3000')
Invoke-Checked $adb @('-s', $Serial, 'install', '-r', $apk)
Invoke-Checked $adb @(
  '-s',
  $Serial,
  'shell',
  'am',
  'start',
  '-n',
  'com.anonymous.medibusdriverapp/.MainActivity'
)

Write-Host "App rebuilt, installed, and launched on $Serial."
