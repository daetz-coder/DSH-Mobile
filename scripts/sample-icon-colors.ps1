$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$src = 'D:\2026AppDev\DSH-Mobile\assets\app-icon.png'
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap($img)
$w = [int]$bmp.Width
$h = [int]$bmp.Height
$pts = New-Object System.Collections.ArrayList
[void]$pts.Add(@('TL', [int]5, [int]5))
[void]$pts.Add(@('TR', [int]($w - 6), [int]5))
[void]$pts.Add(@('BL', [int]5, [int]($h - 6)))
[void]$pts.Add(@('BR', [int]($w - 6), [int]($h - 6)))
[void]$pts.Add(@('topMid', [int]($w / 2), [int]5))
[void]$pts.Add(@('leftMid', [int]5, [int]($h / 2)))
foreach ($p in $pts) {
  $c = $bmp.GetPixel($p[1], $p[2])
  Write-Host ("{0}: rgba({1},{2},{3},{4})" -f $p[0], $c.R, $c.G, $c.B, $c.A)
}
$cc = $bmp.GetPixel([int]($w / 2), [int]($h / 2))
Write-Host ("center: rgba({0},{1},{2},{3})" -f $cc.R, $cc.G, $cc.B, $cc.A)
$bmp.Dispose(); $img.Dispose()