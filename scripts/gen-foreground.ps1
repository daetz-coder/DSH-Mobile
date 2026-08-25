# Generate DSH-Mobile adaptive-icon FOREGROUND (transparent bg + white mark).
# Uses fully local variables scoped per iteration.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$resDir = "D:\2026AppDev\DSH-Mobile\app\android\app\src\main\res"

function New-Fg([int]$sz, [string]$outPath) {
  $bmp = New-Object System.Drawing.Bitmap -ArgumentList $sz, $sz
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $whiteBrush = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::White)
  $fontSize = $sz * 0.30
  $font = New-Object System.Drawing.Font -ArgumentList @("Consolas", [float]$fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $x = $sz * 0.20; $y = $sz * 0.20; $w = $sz * 0.60; $h = $sz * 0.60
  $rect = New-Object System.Drawing.RectangleF -ArgumentList $x, $y, $w, $h
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString(">_", $font, $whiteBrush, $rect, $fmt)
  $g.Save()
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $whiteBrush.Dispose(); $font.Dispose(); $fmt.Dispose()
}

New-Fg 108 "$resDir\mipmap-mdpi\ic_launcher_foreground.png"
New-Fg 162 "$resDir\mipmap-hdpi\ic_launcher_foreground.png"
New-Fg 216 "$resDir\mipmap-xhdpi\ic_launcher_foreground.png"
New-Fg 324 "$resDir\mipmap-xxhdpi\ic_launcher_foreground.png"
New-Fg 432 "$resDir\mipmap-xxxhdpi\ic_launcher_foreground.png"
Write-Host "FOREGROUND DONE"