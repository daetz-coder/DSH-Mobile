# Regenerate launcher icons for the white-bg + blue-logo app icon.
# Adaptive safe zone: central 66/108 = 61.1% of the canvas. The blue logo
# spans ~88.3% of the source image width, so scale the full image to
# 0.611/0.883 = 0.692 of the canvas, centered, so the logo lands inside the
# guaranteed-visible zone on every launcher mask.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$srcPath = 'D:\2026AppDev\DSH-Mobile\assets\app-icon.png'
$res = 'D:\2026AppDev\DSH-Mobile\app\android\app\src\main\res'

$src = [System.Drawing.Image]::FromFile($srcPath)
$FILL = 0.692   # canvas fill ratio -> logo within safe zone

function New-Icon($canvasPx, $outPath) {
  $bmp = New-Object System.Drawing.Bitmap($canvasPx, $canvasPx)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $size = [int][Math]::Round($canvasPx * $FILL)
  $off = [int][Math]::Round(($canvasPx - $size) / 2.0)
  $g.DrawImage($src, $off, $off, $size, $size)
  $g.Save()
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host ("wrote {0} ({1}px, content {2}px)" -f $outPath, $canvasPx, $size)
}

# --- legacy launcher icons (48dp canvas per density) ---
$legacy = @{ 'mipmap-mdpi' = 48; 'mipmap-hdpi' = 72; 'mipmap-xhdpi' = 96; 'mipmap-xxhdpi' = 144; 'mipmap-xxxhdpi' = 192 }
foreach ($k in $legacy.Keys) {
  New-Icon $legacy[$k] (Join-Path $res "$k\ic_launcher.png")
  New-Icon $legacy[$k] (Join-Path $res "$k\ic_launcher_round.png")
}

# --- adaptive foreground (108dp canvas per density) ---
$fg = @{ 'mipmap-mdpi' = 108; 'mipmap-hdpi' = 162; 'mipmap-xhdpi' = 216; 'mipmap-xxhdpi' = 324; 'mipmap-xxxhdpi' = 432 }
foreach ($k in $fg.Keys) {
  New-Icon $fg[$k] (Join-Path $res "$k\ic_launcher_foreground.png")
}

$src.Dispose()
Write-Host 'DONE'