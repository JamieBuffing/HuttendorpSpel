using System;
using System.Windows.Forms;

namespace ACR122UScanner;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        try
        {
            ApplicationConfiguration.Initialize();
            Application.Run(new TrayApplicationContext());
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                ex.ToString(),
                $"{Branding.AppName} - opstartfout",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }
}
