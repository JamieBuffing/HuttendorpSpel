param(
  [string]$RuntimeUrl = "https://aka.ms/dotnet/8.0/windowsdesktop-runtime-win-x64.exe"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Iss = Join-Path $Root "installer\huttendorp-nfc-scanner.iss"

$PossibleInnoPaths = @(
  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
  "C:\Program Files\Inno Setup 6\ISCC.exe"
)

$InnoCompiler = $PossibleInnoPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $InnoCompiler) {
  throw "Inno Setup compiler niet gevonden. Installeer Inno Setup 6. Verwacht pad: C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
}

Set-Location $Root

& $PSScriptRoot\build-app.ps1
& $InnoCompiler "/DRuntimeUrl=$RuntimeUrl" $Iss

Write-Host ""
Write-Host "Setup.exe staat hier:"
Write-Host "$Root\installer\dist\HuttendorpDeMeentNfcScannerSetup.exe"
