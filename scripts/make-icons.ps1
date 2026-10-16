Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "public\icons"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$wine = [System.Drawing.Color]::FromArgb(255, 122, 35, 64)
$white = [System.Drawing.Color]::White

function Measure-Glyph([System.Drawing.Bitmap]$bmp) {
  $w = $bmp.Width
  $cx = $w / 2.0
  $limit = $w * 0.30
  $minX = $w; $minY = $w; $maxX = 0; $maxY = 0; $n = 0
  for ($y = 0; $y -lt $w; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $dx = $x - $cx; $dy = $y - $cx
      if (($dx * $dx + $dy * $dy) -gt ($limit * $limit)) { continue }
      $c = $bmp.GetPixel($x, $y)
      if ($c.R -gt 220 -and $c.G -gt 220 -and $c.B -gt 220) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
        $n++
      }
    }
  }
  if ($n -eq 0) { return $null }
  return @{
    dx = (($minX + $maxX) / 2.0) - $cx
    dy = (($minY + $maxY) / 2.0) - $cx
  }
}

function Draw-Icon([int]$size, [double]$shiftX, [double]$shiftY) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear($wine)
  $penW = [Math]::Max(2.0, $size * 0.028)
  $pen = New-Object System.Drawing.Pen $white, ([single]$penW)
  $inset = $size * 0.075 + $penW / 2.0
  $d = $size - (2 * $inset)
  $g.DrawEllipse($pen, ([single]$inset), ([single]$inset), ([single]$d), ([single]$d))
  $font = New-Object System.Drawing.Font "Georgia", ([single]($size * 0.50)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush $white
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF ([single]$shiftX), ([single]($shiftY - ($size * 0.03))), $size, $size
  $g.DrawString("G", $font, $brush, $rect, $format)
  $g.Dispose(); $pen.Dispose(); $font.Dispose(); $brush.Dispose(); $format.Dispose()
  return $bmp
}

$sample = Draw-Icon 512 0 0
$delta = Measure-Glyph $sample
$sample.Dispose()
$shiftX = -1 * $delta.dx
$shiftY = -1 * $delta.dy
$check = Draw-Icon 512 $shiftX $shiftY
$after = Measure-Glyph $check
$check.Dispose()
"glyph shift x=$([math]::Round($shiftX,2)) y=$([math]::Round($shiftY,2)) leftover x=$([math]::Round($after.dx,2)) y=$([math]::Round($after.dy,2))"

foreach ($size in @(180, 192, 512)) {
  $bmp = Draw-Icon $size ($shiftX * $size / 512.0) ($shiftY * $size / 512.0)
  $file = Join-Path $outDir "icon-$size.png"
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
Write-Output "icons ok"
