#define AppName "Huttendorp de Meent NFC Scanner"
#define AppExe "Huttendorp de Meent NFC Scanner.exe"
#ifndef RuntimeUrl
  #define RuntimeUrl "https://spel.jabuvo.nl/api/download-dotnet-runtime"
#endif

[Setup]
AppId={{D4F660A5-B8D4-4F1C-BEC4-ACR122UHDM}}
AppName={#AppName}
AppVersion=1.0.0
AppPublisher=Huttendorp de Meent
DefaultDirName={autopf}\Huttendorp de Meent NFC Scanner
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

[Files]
Source: "..\bin\Release\net8.0-windows\win-x64\publish\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\bin\Release\net8.0-windows\win-x64\publish\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autostartup}\{#AppName}"; Filename: "{app}\{#AppExe}"

[Run]
Filename: "{app}\{#AppExe}"; Description: "Start NFC scanner"; Flags: nowait postinstall skipifsilent

[Code]
function IsDotNetDesktopRuntimeInstalled(): Boolean;
var
  ResultCode: Integer;
begin
  Result := RegKeyExists(HKLM64, 'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.WindowsDesktop.App\8.0');

  if not Result then
  begin
    Result := Exec('dotnet', '--list-runtimes', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
  end;
end;

function DownloadFile(Url: String; TargetPath: String): Boolean;
var
  ResultCode: Integer;
  Args: String;
begin
  Args := '-NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri ''' + Url + ''' -OutFile ''' + TargetPath + '''"';
  Result := Exec('powershell.exe', Args, '', SW_SHOW, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
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

  MsgBox('.NET Desktop Runtime 8 ontbreekt. De installer downloadt en installeert deze nu.', mbInformation, MB_OK);

  if not DownloadFile('{#RuntimeUrl}', RuntimePath) then
  begin
    MsgBox('Downloaden van .NET Desktop Runtime is mislukt.', mbError, MB_OK);
    Result := False;
    exit;
  end;

  if not Exec(RuntimePath, '/install /quiet /norestart', '', SW_SHOW, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
  begin
    MsgBox('Installeren van .NET Desktop Runtime is mislukt.', mbError, MB_OK);
    Result := False;
    exit;
  end;
end;
