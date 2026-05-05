using System;
using System.Collections.Generic;
using System.IO;
using System.Windows.Forms;

namespace ACR122UScanner;

public sealed class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon trayIcon;
    private readonly NfcScanner scanner;
    private readonly LocalStatusServer localStatusServer;
    private readonly List<ScanEntry> scans = new();
    private readonly AppSettings settings;

    private OverviewForm? overviewForm;
    private SettingsForm? settingsForm;
    private string status = "Programma gestart";
    private string reader = "Geen reader verbonden";

    public TrayApplicationContext()
    {
        settings = AppSettings.Load();
        StartupManager.SetStartWithWindows(settings.StartWithWindows);

        scanner = new NfcScanner
        {
            DuplicateBlockMs = settings.DuplicateBlockMs
        };

        scanner.StatusChanged += OnStatusChanged;
        scanner.ReaderChanged += OnReaderChanged;
        scanner.CardScanned += OnCardScanned;

        localStatusServer = new LocalStatusServer(() => new LocalStatusSnapshot(
            status,
            reader,
            settings.TypingEnabled,
            scans.Count
        ));
        localStatusServer.Start();

        trayIcon = new NotifyIcon
        {
            Icon = Branding.LoadAppIcon(),
            Text = Branding.AppName,
            Visible = true
        };

        trayIcon.DoubleClick += (_, _) => OpenOverview();
        RefreshTrayMenu();

        scanner.Start();
    }

    private void RefreshTrayMenu()
    {
        trayIcon.ContextMenuStrip = new ContextMenuStrip();
        trayIcon.ContextMenuStrip.Items.Add("Overzicht openen", null, (_, _) => OpenOverview());
        trayIcon.ContextMenuStrip.Items.Add("Instellingen openen", null, (_, _) => OpenSettings());
        trayIcon.ContextMenuStrip.Items.Add(new ToolStripSeparator());
        trayIcon.ContextMenuStrip.Items.Add(settings.TypingEnabled ? "Pauzeren" : "Hervatten", null, (_, _) => ToggleTyping());
        trayIcon.ContextMenuStrip.Items.Add(new ToolStripSeparator());
        trayIcon.ContextMenuStrip.Items.Add("Afsluiten", null, (_, _) => ExitApp());
    }

    private void ToggleTyping()
    {
        settings.TypingEnabled = !settings.TypingEnabled;
        settings.Save();
        RefreshTrayMenu();
        overviewForm?.UpdateTyping(settings.TypingEnabled);
        settingsForm?.LoadSettings(settings);
    }

    private void OpenOverview()
    {
        if (overviewForm == null || overviewForm.IsDisposed)
        {
            overviewForm = new OverviewForm(scans);
            overviewForm.ClearRequested += () =>
            {
                scans.Clear();
                overviewForm?.UpdateData(scans, status, reader, settings.TypingEnabled);
            };
        }

        overviewForm.UpdateData(scans, status, reader, settings.TypingEnabled);
        overviewForm.Show();
        overviewForm.WindowState = FormWindowState.Normal;
        overviewForm.Activate();
    }

    private void OpenSettings()
    {
        if (settingsForm == null || settingsForm.IsDisposed)
        {
            settingsForm = new SettingsForm(settings);
            settingsForm.SettingsSaved += updated =>
            {
                settings.TypingEnabled = updated.TypingEnabled;
                settings.StartWithWindows = updated.StartWithWindows;
                settings.PressEnterAfterScan = updated.PressEnterAfterScan;
                settings.DuplicateBlockMs = updated.DuplicateBlockMs;
                settings.Save();

                scanner.DuplicateBlockMs = settings.DuplicateBlockMs;
                StartupManager.SetStartWithWindows(settings.StartWithWindows);
                RefreshTrayMenu();
                overviewForm?.UpdateData(scans, status, reader, settings.TypingEnabled);
            };
        }

        settingsForm.LoadSettings(settings);
        settingsForm.Show();
        settingsForm.WindowState = FormWindowState.Normal;
        settingsForm.Activate();
    }

    private void OnStatusChanged(string message)
    {
        status = message;
        overviewForm?.BeginInvoke(() => overviewForm.UpdateData(scans, status, reader, settings.TypingEnabled));
    }

    private void OnReaderChanged(string name)
    {
        reader = name;
        overviewForm?.BeginInvoke(() => overviewForm.UpdateData(scans, status, reader, settings.TypingEnabled));
    }

    private void OnCardScanned(ScanEntry scan)
    {
        scan.Typed = false;

        if (settings.TypingEnabled)
        {
            try
            {
                WindowsTyper.TypeUid(scan.Uid, settings.PressEnterAfterScan);
                scan.Typed = true;
            }
            catch (Exception ex)
            {
                status = $"Typing fout: {ex.Message}";
                WriteLog(status);
                trayIcon.BalloonTipTitle = "Typing fout";
                trayIcon.BalloonTipText = ex.Message;
                trayIcon.ShowBalloonTip(3000);
            }
        }

        scans.Insert(0, scan);

        if (scans.Count > 250)
        {
            scans.RemoveRange(250, scans.Count - 250);
        }

        overviewForm?.BeginInvoke(() => overviewForm.UpdateData(scans, status, reader, settings.TypingEnabled));
    }

    private static void WriteLog(string message)
    {
        try
        {
            Directory.CreateDirectory(Branding.AppDataDirectory);
            File.AppendAllText(Path.Combine(Branding.AppDataDirectory, "scanner.log"), $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
        }
        catch
        {
            // logging mag de scanner nooit stoppen
        }
    }

    private void ExitApp()
    {
        trayIcon.Visible = false;
        localStatusServer.Dispose();
        scanner.Dispose();
        Application.Exit();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            trayIcon.Dispose();
            localStatusServer.Dispose();
            scanner.Dispose();
        }

        base.Dispose(disposing);
    }
}
