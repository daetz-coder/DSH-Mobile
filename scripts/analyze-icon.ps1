$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$src = 'D:\2026AppDev\DSH-Mobile\assets\app-icon.png'
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap($img)
$w = [int]$bmp.Width
$h = [int]$bmp.Height
# "blue-ish" = b > r + 40 (deep blue logo on white). Find its bbox.
$xMin = $w; $xMax = -1; $yMin = $h; $yMax = -1; $bluePx = 0; $total = 0
for ($y = 0; $y -lt $h; $y += 2) {
  for ($x = 0; $x -lt $w; $x += 2) {
    $total++
    $p = $bmp.GetPixel($x, $y)
    if (([int]$p.B - [int]$p.R) -gt 40 -and ([int]$p.B - [int]$p.G) -gt 20) {
      $bluePx++
      if ($x -lt $xMin) { $xMin = $x }
      if ($x -gt $xMax) { $xMax = $x }
      if ($y -lt $yMin) { $yMin = $y }
      if ($y -gt $yMax) { $yMax = $y }
    }
  }
}
Write-Host ("blue bbox: x {0}..{1} y {2}..{3}  size {4}x{5} of {6}x{7}" -f $xMin, $xMax, $yMin, $yMax, ($xMax - $xMin + 1), ($yMax - $yMin + 1), $w, $h)
Write-Host ("blue share of image: {0:N1}%" -f (100.0 * $bluePx / $total))
$bmp.Dispose(); $img.Dispose()