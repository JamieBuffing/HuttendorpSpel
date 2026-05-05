param(
  [Parameter(Mandatory=$true)]
  [string]$RuntimeUrl
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Iss = Join-Path $Root "installer\huttendorp-nfc-scanner.iss"
$InnoCompiler = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"

if (!(Test-Path $InnoCompiler)) {
  throw "Inno Setup compiler niet gevonden. Installeer Inno Setup 6 of pas het pad in scripts\build-setup.ps1 aan."
}

Set-Location $Root

& $PSScriptRoot\build-app.ps1
& $InnoCompiler "/DRuntimeUrl=$RuntimeUrl" $Iss

Write-Host ""
Write-Host "Setup.exe staat hier:"
Write-Host "$Root\installer\dist\HuttendorpDeMeentNfcScannerSetup.exe"
