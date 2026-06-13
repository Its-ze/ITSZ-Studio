param(
  [string]$BaseUrl = "https://its-ze.github.io/ITSZ-Studio/downloads"
)

$ErrorActionPreference = "Stop"
$manifestUrl = "$($BaseUrl.TrimEnd('/'))/updates.json"
$manifest = Invoke-RestMethod -Uri $manifestUrl -UseBasicParsing
$installerUrl = $manifest.installers.windows.installer

if ([string]::IsNullOrWhiteSpace($installerUrl)) {
  throw "No Windows installer is listed in $manifestUrl"
}

$downloadDir = Join-Path $env:TEMP "ITSZ-Studio"
New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null
$installerPath = Join-Path $downloadDir (Split-Path ([uri]$installerUrl).AbsolutePath -Leaf)

Write-Host "Downloading ITSZ's Studio $($manifest.version)..."
Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing

Write-Host "Starting installer..."
Start-Process -FilePath $installerPath -Wait
