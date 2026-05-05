#define AppName "Huttendorp de Meent NFC Scanner"
#define AppExe "Huttendorp de Meent NFC Scanner.exe"
#ifndef RuntimeUrl
  #define RuntimeUrl "https://aka.ms/dotnet/8.0/windowsdesktop-runtime-win-x64.exe"
#endif

[Setup]
AppId={{D4F660A5-B8D4-4F1C-BEC4-AC1220A8D0B1}}
AppName={#AppName}
AppVersion=1.0.1
AppPublisher=Huttendorp de Meent
DefaultDirName={localappdata}\Programs\Huttendorp de Meent NFC Scanner
DefaultGroupName=Huttendorp de Meent
OutputDir=dist
OutputBaseFilename=HuttendorpDeMeentNfcScannerSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\assets\favicon.ico
UninstallDisplayIcon={app}\{#AppExe}
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
DisableDirPage=no
DisableProgramGroupPage=yes

[Files]
Source: "..\bin\Release\net8.0-windows\win-x64\publish\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\bin\Release\net8.0-windows\win-x64\publish\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Bureaublad snelkoppeling maken"; GroupDescription: "Extra snelkoppelingen:"; Flags: unchecked

[Run]
Filename: "{app}\{#AppExe}"; Description: "Start NFC scanner"; Flags: nowait postinstall skipifsilent

[Code]
function HasRuntimeRegistryKey(): Boolean;
begin
  Result :=
    RegKeyExists(HKLM64, 'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.WindowsDesktop.App\8.0') or
    RegKeyExists(HKLM32, 'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.WindowsDesktop.App\8.0') or
    RegKeyExists(HKCU, 'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.WindowsDesktop.App\8.0');
end;

function HasRuntimeFolder(BasePath: String): Boolean;
var
  FindRec: TFindRec;
begin
  Result := False;

  if FindFirst(BasePath + '\dotnet\shared\Microsoft.WindowsDesktop.App\8.*', FindRec) then
  begin
    try
      Result := True;
    finally
      FindClose(FindRec);
    end;
  end;
end;

function IsDotNetDesktopRuntimeInstalled(): Boolean;
begin
  Result :=
    HasRuntimeRegistryKey() or
    HasRuntimeFolder(ExpandConstant('{pf}')) or
    HasRuntimeFolder(ExpandConstant('{pf64}'));
end;

function DownloadFile(Url: String; TargetPath: String): Boolean;
var
  ResultCode: Integer;
  Args: String;
begin
  Args := '-NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference = ''SilentlyContinue''; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri ''' + Url + ''' -OutFile ''' + TargetPath + '''"';
  Result := Exec('powershell.exe', Args, '', SW_SHOW, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0) and FileExists(TargetPath);
end;

function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
  RuntimePath: String;
begin
  Result := True;

  if IsDotNetDesktopRuntimeInstalled() then
    exit;

  RuntimePath := ExpandConstant('{tmp}\windowsdesktop-runtime-win-x64.exe');

  MsgBox(
    'Deze app heeft .NET Desktop Runtime 8 nodig.' + #13#10 + #13#10 +
    'Let op: een .NET SDK of .NET 9 runtime telt niet altijd als .NET Desktop Runtime 8.' + #13#10 + #13#10 +
    'De installer downloadt deze runtime nu automatisch via Microsoft.',
    mbInformation,
    MB_OK
  );

  if not DownloadFile('{#RuntimeUrl}', RuntimePath) then
  begin
    MsgBox(
      'Downloaden van .NET Desktop Runtime 8 is mislukt.' + #13#10 + #13#10 +
      'Controleer internettoegang en probeer opnieuw.' + #13#10 + #13#10 +
      'Gebruikte URL:' + #13#10 + '{#RuntimeUrl}',
      mbError,
      MB_OK
    );
    Result := False;
    exit;
  end;

  if not Exec(RuntimePath, '/install /passive /norestart', '', SW_SHOW, ewWaitUntilTerminated, ResultCode) then
  begin
    MsgBox(
      'Installeren van .NET Desktop Runtime 8 kon niet worden gestart.',
      mbError,
      MB_OK
    );
    Result := False;
    exit;
  end;

  if (ResultCode <> 0) and (ResultCode <> 3010) then
  begin
    MsgBox(
      'Installeren van .NET Desktop Runtime 8 is mislukt.' + #13#10 + #13#10 +
      'Installer exit code: ' + IntToStr(ResultCode),
      mbError,
      MB_OK
    );
    Result := False;
    exit;
  end;
end;
