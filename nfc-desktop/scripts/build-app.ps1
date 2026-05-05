$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "Kleine app build maken..."
dotnet publish -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -p:IncludeAllContentForSelfExtract=true

Write-Host ""
Write-Host "Kleine app build staat hier:"
Write-Host "$Root\bin\Release\net8.0-windows\win-x64\publish\Huttendorp de Meent NFC Scanner.exe"
