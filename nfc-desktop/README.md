# Huttendorp de Meent NFC Scanner

Windows tray app voor de ACR122U NFC reader.

## Wat zit erin

- Kleine framework-dependent app build
- Inno Setup installerconfig
- Build scripts
- Site snippets voor downloadknop en .NET runtime endpoint

## Build app

```powershell
cd C:\Jamie\development\JaBuvo\huttendorp\nfc-desktop
.\scripts\build-app.ps1
```

## Build setup.exe

```powershell
cd C:\Jamie\development\JaBuvo\huttendorp\nfc-desktop
.\scripts\build-setup.ps1 -RuntimeUrl "https://spel.jabuvo.nl/api/download-dotnet-runtime"
```

Output:

```txt
installer\dist\HuttendorpDeMeentNfcScannerSetup.exe
```

Zet die in:

```txt
public\downloads\HuttendorpDeMeentNfcScannerSetup.exe
```
