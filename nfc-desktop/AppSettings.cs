using System;
using System.IO;
using System.Text.Json;

namespace ACR122UScanner;

public sealed class AppSettings
{
    public bool TypingEnabled { get; set; } = true;
    public bool StartWithWindows { get; set; } = true;
    public bool PressEnterAfterScan { get; set; } = true;
    public int DuplicateBlockMs { get; set; } = 1000;

    private static string SettingsDirectory => Branding.AppDataDirectory;
    private static string SettingsPath => Path.Combine(SettingsDirectory, "settings.json");

    public static AppSettings Load()
    {
        try
        {
            if (!File.Exists(SettingsPath)) return new AppSettings();
            var json = File.ReadAllText(SettingsPath);
            return JsonSerializer.Deserialize<AppSettings>(json) ?? new AppSettings();
        }
        catch
        {
            return new AppSettings();
        }
    }

    public void Save()
    {
        Directory.CreateDirectory(SettingsDirectory);
        var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(SettingsPath, json);
    }
}
