# Generate DSH-Mobile branded launcher/splash assets with System.Drawing.
# Design: #4176E6 (DSH primary) rounded-square background, white stylized
# "D" mark with a small chat/terminal caret to evoke the harness.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$resDir = "D:\2026AppDev\DSH-Mobile\app\android\app\src\main\res"

function New-RoundedBg($size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0x41, 0x76, 0xE6))
  $radius = $size * 0.22
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $size
  $path.AddArc(0, 0, $radius*2, $radius*2, 180, 90)
  $path.AddArc($d-$radius*2, 0, $radius*2, $radius*2, 270, 90)
  $path.AddArc($d-$radius*2, $d-$radius*2, $radius*2, $radius*2, 0, 90)
  $path.AddArc(0, $d-$radius*2, $radius*2, $radius*2, 90, 90)
  $path.CloseFigure()
  $g.FillPath($bg, $path)
  return @{ bmp=$bmp; g=$g }
}

function Draw-Mark($g, $d) {
  # White "D" letterform + small cursor dot
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $font = New-Object System.Drawing.Font("Segoe UI", [float]($d*0.52), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF(0, $d*0.06, $d, $d*0.88)
  # Draw a terminal-style ">_" instead of plain D: invoke chars
  $g.DrawString(">_", $font, $white, $rect, $sf)
  $white.Dispose(); $font.Dispose(); $sf.Dispose()
}

function Save-Icon($dir, $size, $round) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(255, 0x41, 0x76, 0xE6))
  if ($round) {
    # full-bleed circle for round icon
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0x41, 0x76, 0xE6))
    $g.FillEllipse($brush, 0, 0, $size, $size)
  }
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $font = New-Object System.Drawing.Font("Consolas", [float]($size*0.5), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString(">_", $font, $white, $rect, $fmt)
  $g.Save()
  $bmp.Save($dir, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

# --- legacy launcher PNGs ---
$densities = @{ "mipmap-mdpi"=48; "mipmap-hdpi"=72; "mipmap-xhdpi"=96; "mipmap-xxhdpi"=144; "mipmap-xxxhdpi"=192 }
foreach ($k in $densities.Keys) {
  Save-Icon "$resDir\$k\ic_launcher.png" $densities[$k] $false
  Save-Icon "$resDir\$k\ic_launcher_round.png" $densities[$k] $true
  Write-Host "wrote $k ($($densities[$k])px)"
}

# --- adaptive icon: foreground (safe zone 66%) + background color ---
# foreground: mark centered at 1/2 with content within inner 60%
foreach ($k in $densities.Keys) {
  Save-Icon "$resDir\$k\ic_launcher_foreground.png" ([int]($densities[$k]*1.5)) $false
}

# splash.png (portrait 1080x1920-ish scaled per density not required; use drawable)
$splash = New-Object System.Drawing.Bitmap(1080, 1920)
$sg = [System.Drawing.Graphics]::FromImage($splash)
$sg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$sg.Clear([System.Drawing.Color]::FromArgb(255, 0x41, 0x76, 0xE6))
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font("Consolas", 120.0, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$rect = New-Object System.Drawing.RectangleF(0, 0, 1080, 1920)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$sg.DrawString(">_", $font, $white, $rect, $fmt)
$sg.Save()
$splash.Save("$resDir\drawable\splash.png", [System.Drawing.Imaging.ImageFormat]::Png)
$sg.Dispose(); $splash.Dispose()
Write-Host "wrote drawable/splash.png (1080x1920)"

Write-Host "DONE"