# Merge the two phone screenshots (access view + chat view) side by side into
# one wide image for the README / landing page. The two shots must stay
# visually distinct — a wide white gutter plus a light border around each shot
# so nobody mistakes the composite for a single continuous image.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$base = 'D:\2026AppDev\DSH-Mobile\assets'
$imgHome = [System.Drawing.Image]::FromFile("$base\home.jpg")
$imgChat = [System.Drawing.Image]::FromFile("$base\chat.jpg")

$pad = 28         # outer padding around the whole composite
$gutter = 64      # wide white gap between the two shots (clears separation)
$border = 2       # light border around each shot

$h = [Math]::Max($imgHome.Height, $imgChat.Height)
$w = $pad * 2 + $imgHome.Width + $gutter + $imgChat.Width
$outH = $h + $pad * 2

$bmp = New-Object System.Drawing.Bitmap($w, $outH)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::White)

function Draw-Shot($img, $x, $y) {
  # thin light border first (gives each screenshot its own card edge)
  $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 0xE2, 0xE5, 0xEA), $border)
  $g.DrawRectangle($borderPen, $x, $y, $img.Width + $border, $img.Height + $border)
  $borderPen.Dispose()
  $g.DrawImage($img, $x + $border, $y + $border, $img.Width, $img.Height)
}

Draw-Shot $imgHome $pad $pad
Draw-Shot $imgChat ($pad + $imgHome.Width + $gutter) $pad

$out = "$base\screens.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host ("wrote {0}  {1}x{2}" -f $out, $w, $outH)
$g.Dispose(); $bmp.Dispose(); $imgHome.Dispose(); $imgChat.Dispose()