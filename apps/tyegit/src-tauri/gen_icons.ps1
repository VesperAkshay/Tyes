Add-Type -AssemblyName System.Drawing

$dir = "f:\Tyes\apps\tyegit\src-tauri\icons"
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

$bmp32 = New-Object System.Drawing.Bitmap 32, 32
$g32 = [System.Drawing.Graphics]::FromImage($bmp32)
$g32.Clear([System.Drawing.Color]::FromArgb(139, 133, 196))
$bmp32.Save("$dir\32x32.png", [System.Drawing.Imaging.ImageFormat]::Png)

$bmp128 = New-Object System.Drawing.Bitmap 128, 128
$g128 = [System.Drawing.Graphics]::FromImage($bmp128)
$g128.Clear([System.Drawing.Color]::FromArgb(139, 133, 196))
$bmp128.Save("$dir\128x128.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp128.Save("$dir\128x128@2x.png", [System.Drawing.Imaging.ImageFormat]::Png)
Copy-Item "$dir\128x128.png" "$dir\icon.icns" -Force

$fs = [System.IO.File]::Create("$dir\icon.ico")
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([int16]0)
$bw.Write([int16]1)
$bw.Write([int16]1)
$bw.Write([byte]32)
$bw.Write([byte]32)
$bw.Write([byte]0)
$bw.Write([byte]0)
$bw.Write([int16]1)
$bw.Write([int16]32)

$ms = New-Object System.IO.MemoryStream
$bmp32.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$bytes = $ms.ToArray()

$bw.Write([int]$bytes.Length)
$bw.Write([int]22)
$bw.Write($bytes)
$bw.Close()
$fs.Close()
