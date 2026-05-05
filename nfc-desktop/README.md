# Huttendorp de Meent NFC Scanner

Windows tray app voor de ACR122U NFC reader.

## Wat zit erin

- C# WinForms tray app
- Overzicht en instellingen
- Automatisch typen via Windows SendInput
- Geen notificatie bij elke scan
- Installerconfig voor Inno Setup
- Build scripts met `.cmd` wrappers zodat PowerShell execution policy geen probleem is

## Stap 1 - app testen

```powershell
cd C:\Jamie\development\JaBuvo\huttendorp\nfc-desktop
dotnet run
```

## Stap 2 - kleine app build maken

Gebruik bij voorkeur de `.cmd`, die omzeilt de PowerShell scriptblokkade:

```powershell
cd C:\Jamie\development\JaBuvo\huttendorp\nfc-desktop
.\scripts\build-app.cmd
```

De app komt hier:

```txt
bin\Release\net8.0-windows\win-x64\publish\Huttendorp de Meent NFC Scanner.exe
```

## Stap 3 - setup.exe maken

Installeer eerst Inno Setup 6 als dat nog niet is gedaan.

Daarna:

```powershell
cd C:\Jamie\development\JaBuvo\huttendorp\nfc-desktop
.\scripts\build-setup.cmd
```

De setup gebruikt standaard deze Microsoft runtime download:

```txt
https://aka.ms/dotnet/8.0/windowsdesktop-runtime-win-x64.exe
```

Wil je toch je eigen endpoint gebruiken:

```powershell
.\scripts\build-setup.cmd "https://jouwdomein.nl/api/download-dotnet-runtime"
```

De setup komt hier:

```txt
installer\dist\HuttendorpDeMeentNfcScannerSetup.exe
```

Zet die in je website:

```txt
public\downloads\HuttendorpDeMeentNfcScannerSetup.exe
```

## Website downloadknop

```ejs
<a class="button" href="/downloads/HuttendorpDeMeentNfcScannerSetup.exe" download>
  Download NFC scanner
</a>
```

## Belangrijk

- De app target .NET 8 Windows Desktop Runtime.
- Een .NET 9 SDK is niet hetzelfde als .NET 8 Desktop Runtime.
- De installer downloadt .NET 8 Desktop Runtime automatisch als die ontbreekt.
- De app zet zichzelf bij eerste start op automatisch opstarten via de instellingen/registry.
- De installer maakt zelf geen startup-snelkoppeling meer, zodat de instellingenpagina het opstartgedrag echt kan beheren.


## Website detectie

De app start lokaal een status endpoint op:

```txt
http://127.0.0.1:47832/status
```

De website kan dit endpoint checken. Als de scanner actief is, kan de downloadknop verborgen worden. Gebruik hiervoor `site-snippets/download-button.ejs`.
