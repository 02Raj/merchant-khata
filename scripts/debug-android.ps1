# Capture Android crash logs while you open the installed APK.
# Phone: USB debugging ON, cable connected, "Allow" on prompt.

$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

function Find-Adb {
  $cmd = Get-Command adb -ErrorAction SilentlyContinue
  if ($cmd -and (Test-Path $cmd.Source)) {
    return $cmd.Source
  }

  $candidates = @(
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    "$env:USERPROFILE\AppData\Local\Android\Sdk\platform-tools\adb.exe"
  )

  foreach ($path in $candidates) {
    if (Test-Path $path) {
      return $path
    }
  }

  $wingetAdb = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter 'adb.exe' -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName

  if ($wingetAdb) {
    return $wingetAdb
  }

  return $null
}

$adb = Find-Adb

if (-not $adb) {
  Write-Host 'adb not found. Install Android Platform Tools:'
  Write-Host '  winget install Google.PlatformTools'
  Write-Host 'Then close this terminal, open a new one, and run: npm run debug:android'
  exit 1
}

Write-Host "Using: $adb"
& $adb devices

$devices = & $adb devices | Select-String 'device$'
if (-not $devices) {
  Write-Host ''
  Write-Host 'No phone detected. Check:'
  Write-Host '  1. USB cable connected (data, not charge-only)'
  Write-Host '  2. USB debugging ON + Allow on phone'
  Write-Host '  3. USB mode = File transfer / MTP'
  exit 1
}

Write-Host ''
Write-Host 'Clearing old logs...'
& $adb logcat -c

Write-Host ''
Write-Host '>>> NOW open OmniBill on your phone (the installed APK).'
Write-Host '>>> When it crashes, press Ctrl+C here.'
Write-Host ''
Write-Host 'Filtering for React Native / Expo / fatal errors...'
Write-Host ''

& $adb logcat *:S ReactNative:V ReactNativeJS:V Expo:V AndroidRuntime:E libc:F DEBUG:F
