# Merge the two phone screenshots (access view + chat view) side by side into
# one wide image for the README — both are tall portraits, so a merged shot
# reads better than two full-height images stacked.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$base = 'D:\2026AppDev\DSH-Mobile\assets'
$imgHome = [System.Drawing.Image]::FromFile("$base\home.jpg")
$imgChat = [System.Drawing.Image]::FromFile("$base\chat.jpg")

$gap = 16  # px between the two shots
$pad = 24  # outer padding
$h = [Math]::Max($imgHome.Height, $imgChat.Height)
$w = $pad * 2 + $imgHome.Width + $gap + $imgChat.Width
$outH = $h + $pad * 2

$bmp = New-Object System.Drawing.Bitmap($w, $outH)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::White)

$g.DrawImage($imgHome, $pad, $pad, $imgHome.Width, $imgHome.Height)
$g.DrawImage($imgChat, $pad + $imgHome.Width + $gap, $pad, $imgChat.Width, $imgChat.Height)

$out = "$base\screens.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host ("wrote {0}  {1}x{2}" -f $out, $w, $outH)
$g.Dispose(); $bmp.Dispose(); $imgHome.Dispose(); $imgChat.Dispose()