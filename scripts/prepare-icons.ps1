# Ensures build/icon.png and public/logo.png are valid PNG (not mislabeled JPEG).
# Run before pack if you replace the logo file.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$srcCandidates = @(
  (Join-Path $root 'build\icon-source.png'),
  (Join-Path $root 'build\icon-source.jpg'),
  (Join-Path $root 'public\logo.png'),
  (Join-Path $root 'build\icon.png')
)

function Test-Png([byte[]]$bytes) {
  return ($bytes.Length -ge 24 -and $bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50)
}

function Convert-ToPng256([string]$source, [string]$dest) {
  Add-Type -AssemblyName System.Drawing
  $img = [System.Drawing.Image]::FromFile($source)
  $bmp = New-Object System.Drawing.Bitmap 256, 256
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::White)
  $g.DrawImage($img, 0, 0, 256, 256)
  $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
}

$buildPng = Join-Path $root 'build\icon.png'
$publicPng = Join-Path $root 'public\logo.png'
$bytes = [System.IO.File]::ReadAllBytes($buildPng)

if (-not (Test-Png $bytes)) {
  $source = $null
  foreach ($c in $srcCandidates) {
    if (Test-Path $c) { $source = $c; break }
  }
  if (-not $source) { throw "build/icon.png is not PNG. Add build/icon-source.png or a valid logo." }
  Write-Host "Converting $source -> PNG 256x256"
  Convert-ToPng256 $source $buildPng
}

Copy-Item $buildPng $publicPng -Force
$check = [System.IO.File]::ReadAllBytes($buildPng)
if (-not (Test-Png $check)) { throw 'Icon conversion failed' }
Write-Host "Icons OK: build/icon.png, public/logo.png"
