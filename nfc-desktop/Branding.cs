using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;

namespace ACR122UScanner;

public static class Branding
{
    public const string BrandName = "Huttendorp de Meent";
    public const string AppName = "Huttendorp de Meent NFC Scanner";

    public static readonly Color BackgroundColor = Color.FromArgb(11, 31, 58);
    public static readonly Color CardColor = Color.FromArgb(15, 40, 77);
    public static readonly Color AccentColor = Color.FromArgb(47, 128, 237);
    public static readonly Color AccentHoverColor = Color.FromArgb(45, 156, 219);
    public static readonly Color SecondaryAccentColor = Color.FromArgb(108, 92, 231);
    public static readonly Color WarningColor = Color.FromArgb(242, 153, 74);
    public static readonly Color PrimaryTextColor = Color.FromArgb(235, 235, 235);
    public static readonly Color SecondaryTextColor = Color.FromArgb(197, 197, 197);

    public static string AppDataDirectory => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        BrandName,
        "NFC Scanner"
    );

    public static string AssetsDirectory => Path.Combine(AppContext.BaseDirectory, "assets");
    public static string FaviconPngPath => Path.Combine(AssetsDirectory, "favicon.png");
    public static string FaviconIcoPath => Path.Combine(AssetsDirectory, "favicon.ico");
    public static string LogoPath => Path.Combine(AssetsDirectory, "logo_full.png");

    public static Icon LoadAppIcon()
    {
        if (File.Exists(FaviconIcoPath))
        {
            return new Icon(FaviconIcoPath);
        }

        if (File.Exists(FaviconPngPath))
        {
            using var bitmap = new Bitmap(FaviconPngPath);
            var handle = bitmap.GetHicon();

            try
            {
                return (Icon)Icon.FromHandle(handle).Clone();
            }
            finally
            {
                DestroyIcon(handle);
            }
        }

        return SystemIcons.Application;
    }

    public static Image? LoadLogoImage()
    {
        if (!File.Exists(LogoPath))
        {
            return null;
        }

        using var stream = File.OpenRead(LogoPath);
        using var image = Image.FromStream(stream);
        return (Image)image.Clone();
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyIcon(IntPtr hIcon);
}
