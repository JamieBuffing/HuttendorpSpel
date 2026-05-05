using System;
using System.Drawing;
using System.Windows.Forms;

namespace ACR122UScanner;

public sealed class SettingsForm : Form
{
    private readonly CheckBox typingEnabled = new();
    private readonly CheckBox startWithWindows = new();
    private readonly CheckBox pressEnterAfterScan = new();
    private readonly NumericUpDown duplicateBlockMs = new();
    private readonly Button saveButton = new();

    public event Action<AppSettings>? SettingsSaved;

    public SettingsForm(AppSettings settings)
    {
        Text = $"{Branding.AppName} - Instellingen";
        Width = 760;
        Height = 520;
        MinimumSize = new Size(700, 470);
        BackColor = Branding.BackgroundColor;
        ForeColor = Branding.PrimaryTextColor;
        Font = new Font("Segoe UI", 10);
        StartPosition = FormStartPosition.CenterScreen;
        Icon = Branding.LoadAppIcon();
        BuildLayout();
        LoadSettings(settings);
    }

    private void BuildLayout()
    {
        var root = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(28),
            BackColor = BackColor
        };
        Controls.Add(root);

        var logo = new PictureBox
        {
            Size = new Size(220, 56),
            SizeMode = PictureBoxSizeMode.Zoom,
            Location = new Point(28, 18),
            BackColor = Color.Transparent,
            Image = Branding.LoadLogoImage()
        };

        var eyebrow = new Label
        {
            Text = Branding.BrandName.ToUpperInvariant(),
            ForeColor = Branding.AccentColor,
            Font = new Font("Segoe UI", 9, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(28, 84)
        };
        var title = new Label
        {
            Text = "Instellingen",
            ForeColor = Branding.PrimaryTextColor,
            Font = new Font("Segoe UI", 24, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(26, 106)
        };
        var subtitle = new Label
        {
            Text = "Bepaal hoe de NFC scanner opstart en hoe scans worden getypt.",
            ForeColor = Branding.SecondaryTextColor,
            AutoSize = true,
            Location = new Point(30, 148)
        };

        var card = new ThemedCardPanel
        {
            Location = new Point(28, 188),
            Size = new Size(680, 230),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
        };

        StyleCheckbox(typingEnabled, "Automatisch typen inschakelen", new Point(22, 24));
        StyleCheckbox(startWithWindows, "Automatisch starten wanneer Windows opstart", new Point(22, 64));
        StyleCheckbox(pressEnterAfterScan, "Enter drukken na elke scan", new Point(22, 104));

        var duplicateLabel = new Label
        {
            Text = "Dubbele scan blokkeren binnen milliseconden",
            AutoSize = true,
            Location = new Point(22, 150),
            ForeColor = Branding.PrimaryTextColor
        };

        duplicateBlockMs.Minimum = 0;
        duplicateBlockMs.Maximum = 10000;
        duplicateBlockMs.Increment = 100;
        duplicateBlockMs.Width = 130;
        duplicateBlockMs.Location = new Point(454, 146);
        duplicateBlockMs.BackColor = Branding.BackgroundColor;
        duplicateBlockMs.ForeColor = Branding.PrimaryTextColor;
        duplicateBlockMs.BorderStyle = BorderStyle.FixedSingle;

        saveButton.Text = "Instellingen opslaan";
        saveButton.Width = 190;
        saveButton.Height = 42;
        saveButton.Location = new Point(28, 438);
        saveButton.BackColor = Branding.AccentColor;
        saveButton.ForeColor = Color.White;
        saveButton.FlatStyle = FlatStyle.Flat;
        saveButton.FlatAppearance.BorderSize = 0;
        saveButton.Cursor = Cursors.Hand;
        saveButton.Click += (_, _) => SaveSettings();

        card.Controls.Add(typingEnabled);
        card.Controls.Add(startWithWindows);
        card.Controls.Add(pressEnterAfterScan);
        card.Controls.Add(duplicateLabel);
        card.Controls.Add(duplicateBlockMs);
        root.Controls.Add(logo);
        root.Controls.Add(eyebrow);
        root.Controls.Add(title);
        root.Controls.Add(subtitle);
        root.Controls.Add(card);
        root.Controls.Add(saveButton);
    }

    private static void StyleCheckbox(CheckBox checkBox, string text, Point location)
    {
        checkBox.Text = text;
        checkBox.AutoSize = true;
        checkBox.Location = location;
        checkBox.ForeColor = Branding.PrimaryTextColor;
        checkBox.BackColor = Color.Transparent;
    }

    public void LoadSettings(AppSettings settings)
    {
        typingEnabled.Checked = settings.TypingEnabled;
        startWithWindows.Checked = settings.StartWithWindows;
        pressEnterAfterScan.Checked = settings.PressEnterAfterScan;
        duplicateBlockMs.Value = Math.Clamp(settings.DuplicateBlockMs, 0, 10000);
    }

    private void SaveSettings()
    {
        var settings = new AppSettings
        {
            TypingEnabled = typingEnabled.Checked,
            StartWithWindows = startWithWindows.Checked,
            PressEnterAfterScan = pressEnterAfterScan.Checked,
            DuplicateBlockMs = (int)duplicateBlockMs.Value
        };

        SettingsSaved?.Invoke(settings);
        MessageBox.Show("Instellingen opgeslagen.", Branding.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
    }
}
