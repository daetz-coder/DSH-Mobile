# Helper: type a clean ASCII string into the focused field via hardware key
# events, bypassing CJK IME text-composition (which converts :/. to full-width).
param(
  [Parameter(Mandatory = $true)][string]$Text,
  [string]$Adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
)

# Android keycodes (android.view.KeyEvent)
$keycode = @{
  'a' = 29; 'b' = 30; 'c' = 31; 'd' = 32; 'e' = 33; 'f' = 34; 'g' = 35; 'h' = 36
  'i' = 37; 'j' = 38; 'k' = 39; 'l' = 40; 'm' = 41; 'n' = 42; 'o' = 43; 'p' = 44
  'q' = 45; 'r' = 46; 's' = 47; 't' = 48; 'u' = 49; 'v' = 50; 'w' = 51; 'x' = 52
  'y' = 53; 'z' = 54
  '0' = 7; '1' = 8; '2' = 9; '3' = 10; '4' = 11; '5' = 12; '6' = 13; '7' = 14
  '8' = 15; '9' = 16
  '.' = 56; '/' = 76; ';' = 74; '-' = 69; ':' = 74; ' ' = 62
}

# Keycodes that need the left SHIFT modifier (KEYCODE_SHIFT_LEFT = 59)
$shiftNeeded = @{ ':' = $true }

foreach ($ch in $Text.ToCharArray()) {
  $c = $ch.ToString().ToLowerInvariant()
  if (-not $keycode.ContainsKey($c)) {
    Write-Warning "unmapped char: '$ch'"
    continue
  }
  $kc = $keycode[$c]
  if ($shiftNeeded.ContainsKey($c)) {
    & $Adb shell input keycombination 59 $kc 2>&1 | Out-Null  # SHIFT_LEFT + key
  } else {
    & $Adb shell input keyevent $kc 2>&1 | Out-Null
  }
  Start-Sleep -Milliseconds 12
}
Write-Host "typed: $Text"