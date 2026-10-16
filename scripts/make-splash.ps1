Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $root "public\icons\icon-512.png"
$outDir = Join-Path $root "public\splash"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$icon = [System.Drawing.Image]::FromFile($iconPath)

function New-Splash([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::FromArgb(255, 0, 0, 0))

  $iconSize = [int][Math]::Round($w * 0.34)
  $fontPx = [single]($w * 0.055)
  $font = New-Object System.Drawing.Font "Segoe UI", $fontPx, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $labelSize = $g.MeasureString("G-FIT", $font)
  $gap = [int]($w * 0.04)
  $x = [int](($w - $iconSize) / 2)
  $y = [int](($h - $iconSize) / 2)
  $radius = [Math]::Max(8, [int]($iconSize * 0.22))
  $diameter = $radius * 2
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc(($x + $iconSize - $diameter), $y, $diameter, $diameter, 270, 90)
  $path.AddArc(($x + $iconSize - $diameter), ($y + $iconSize - $diameter), $diameter, $diameter, 0, 90)
  $path.AddArc($x, ($y + $iconSize - $diameter), $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  $g.SetClip($path)
  $g.DrawImage($icon, $x, $y, $iconSize, $iconSize)
  $g.ResetClip()

  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF 0, ($y + $iconSize + $gap), $w, ($labelSize.Height + 8)
  $g.DrawString("G-FIT", $font, $brush, $rect, $format)

  $file = Join-Path $outDir ("{0}x{1}.png" -f $w, $h)
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  $font.Dispose()
  $brush.Dispose()
  $path.Dispose()
  $format.Dispose()
}

@(
  @(640, 1136), @(750, 1334), @(1242, 2208), @(1125, 2436), @(828, 1792),
  @(1242, 2688), @(1170, 2532), @(1284, 2778), @(1179, 2556), @(1290, 2796),
  @(1206, 2622), @(1320, 2868)
) | ForEach-Object { New-Splash $_[0] $_[1] }

$icon.Dispose()
Write-Output "splash ok"
