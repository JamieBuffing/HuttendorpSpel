using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace ACR122UScanner;

public sealed class OverviewForm : Form
{
    private readonly Label statusLabel = new();
    private readonly Label readerLabel = new();
    private readonly Label typingLabel = new();
    private readonly Label latestUidLabel = new();
    private readonly Label countLabel = new();
    private readonly DataGridView grid = new();
    private readonly Button clearButton = new();
    private readonly Button copyLatestButton = new();
    private List<ScanEntry> currentScans = new();

    public event Action? ClearRequested;

    public OverviewForm(IEnumerable<ScanEntry> scans)
    {
        currentScans = scans.ToList();
        Text = $"{Branding.AppName} - Overzicht";
        Width = 1080;
        Height = 760;
        MinimumSize = new Size(920, 620);
        BackColor = Branding.BackgroundColor;
        ForeColor = Branding.PrimaryTextColor;
        Font = new Font("Segoe UI", 10);
        StartPosition = FormStartPosition.CenterScreen;
        Icon = Branding.LoadAppIcon();

        BuildLayout();
    }

    private void BuildLayout()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 4,
            Padding = new Padding(24),
            BackColor = BackColor
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 120));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 92));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 140));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        Controls.Add(root);

        root.Controls.Add(BuildHeader(), 0, 0);

        var stats = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            BackColor = BackColor,
            Padding = new Padding(0, 0, 0, 12)
        };
        stats.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 42));
        stats.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 34));
        stats.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 24));
        root.Controls.Add(stats, 0, 1);

        statusLabel.Text = "Status: starten...";
        readerLabel.Text = "Reader: geen reader";
        typingLabel.Text = "Typen: aan";
        stats.Controls.Add(MakeStatCard(statusLabel), 0, 0);
        stats.Controls.Add(MakeStatCard(readerLabel), 1, 0);
        stats.Controls.Add(MakeStatCard(typingLabel), 2, 0);

        var latestCard = new ThemedCardPanel
        {
            Dock = DockStyle.Fill,
            Margin = new Padding(0, 0, 0, 12)
        };

        var latestCaption = MakeCaption("Laatste scan");
        latestCaption.Location = new Point(18, 16);

        latestUidLabel.Text = "Nog geen kaart gescand";
        latestUidLabel.Font = new Font("Segoe UI", 21, FontStyle.Bold);
        latestUidLabel.ForeColor = Branding.PrimaryTextColor;
        latestUidLabel.AutoSize = true;
        latestUidLabel.Location = new Point(18, 44);

        copyLatestButton.Text = "Kopieer UID";
        StylePrimaryButton(copyLatestButton);
        copyLatestButton.Enabled = false;
        copyLatestButton.Size = new Size(132, 38);
        copyLatestButton.Location = new Point(18, 88);
        copyLatestButton.Click += (_, _) =>
        {
            if (currentScans.Count > 0)
            {
                Clipboard.SetText(currentScans[0].Uid);
            }
        };

        countLabel.Text = "0 scans";
        countLabel.AutoSize = true;
        countLabel.Location = new Point(168, 97);
        countLabel.ForeColor = Branding.SecondaryTextColor;

        latestCard.Controls.Add(latestCaption);
        latestCard.Controls.Add(latestUidLabel);
        latestCard.Controls.Add(copyLatestButton);
        latestCard.Controls.Add(countLabel);
        root.Controls.Add(latestCard, 0, 2);

        var tableCard = new ThemedCardPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(16, 60, 16, 16)
        };

        var tableTitle = new Label
        {
            Text = "Gescande kaarten",
            Font = new Font("Segoe UI", 15, FontStyle.Bold),
            ForeColor = Branding.PrimaryTextColor,
            AutoSize = true,
            Location = new Point(18, 16)
        };

        clearButton.Text = "Overzicht leegmaken";
        StyleSecondaryButton(clearButton);
        clearButton.Size = new Size(168, 36);
        clearButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        clearButton.Location = new Point(tableCard.Width - 188, 14);
        clearButton.Click += (_, _) => ClearRequested?.Invoke();
        tableCard.Resize += (_, _) => clearButton.Location = new Point(tableCard.Width - 188, 14);

        ConfigureGrid();

        tableCard.Controls.Add(grid);
        tableCard.Controls.Add(tableTitle);
        tableCard.Controls.Add(clearButton);
        root.Controls.Add(tableCard, 0, 3);
    }

    private Control BuildHeader()
    {
        var header = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = BackColor,
            Margin = new Padding(0, 0, 0, 12)
        };

        var logo = new PictureBox
        {
            Size = new Size(250, 64),
            SizeMode = PictureBoxSizeMode.Zoom,
            Location = new Point(0, 8),
            BackColor = Color.Transparent
        };
        logo.Image = Branding.LoadLogoImage();

        var eyebrow = new Label
        {
            Text = Branding.BrandName.ToUpperInvariant(),
            ForeColor = Branding.AccentColor,
            Font = new Font("Segoe UI", 9, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(0, 78)
        };

        var title = new Label
        {
            Text = "NFC scanner overzicht",
            ForeColor = Branding.PrimaryTextColor,
            Font = new Font("Segoe UI", 23, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(0, 98)
        };

        var subtitle = new Label
        {
            Text = "Bekijk live welke kaarten zijn gescand. De app blijft op de achtergrond draaien via het systeemvak.",
            ForeColor = Branding.SecondaryTextColor,
            AutoSize = true,
            Location = new Point(330, 28)
        };

        header.Controls.Add(logo);
        header.Controls.Add(eyebrow);
        header.Controls.Add(title);
        header.Controls.Add(subtitle);
        return header;
    }

    private Panel MakeStatCard(Label label)
    {
        var panel = new ThemedCardPanel
        {
            Margin = new Padding(0, 0, 12, 0)
        };

        label.Dock = DockStyle.Fill;
        label.TextAlign = ContentAlignment.MiddleLeft;
        label.Padding = new Padding(16, 0, 12, 0);
        label.Font = new Font("Segoe UI", 10, FontStyle.Bold);
        label.ForeColor = Branding.PrimaryTextColor;
        panel.Controls.Add(label);
        return panel;
    }

    private Label MakeCaption(string text)
    {
        return new Label
        {
            Text = text.ToUpperInvariant(),
            ForeColor = Branding.AccentColor,
            Font = new Font("Segoe UI", 8, FontStyle.Bold),
            AutoSize = true
        };
    }

    private void ConfigureGrid()
    {
        grid.Dock = DockStyle.Fill;
        grid.BackgroundColor = Branding.CardColor;
        grid.BorderStyle = BorderStyle.None;
        grid.AllowUserToAddRows = false;
        grid.AllowUserToDeleteRows = false;
        grid.ReadOnly = true;
        grid.RowHeadersVisible = false;
        grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        grid.ColumnHeadersHeight = 40;
        grid.EnableHeadersVisualStyles = false;
        grid.GridColor = Branding.SecondaryAccentColor;
        grid.ColumnHeadersDefaultCellStyle = new DataGridViewCellStyle
        {
            BackColor = Branding.AccentColor,
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 10, FontStyle.Bold),
            SelectionBackColor = Branding.AccentColor,
            SelectionForeColor = Color.White,
            Alignment = DataGridViewContentAlignment.MiddleLeft
        };
        grid.DefaultCellStyle = new DataGridViewCellStyle
        {
            BackColor = Branding.CardColor,
            ForeColor = Branding.PrimaryTextColor,
            SelectionBackColor = Branding.SecondaryAccentColor,
            SelectionForeColor = Color.White,
            Padding = new Padding(4)
        };
        grid.RowsDefaultCellStyle = grid.DefaultCellStyle;

        grid.Columns.Add("number", "#");
        grid.Columns.Add("uid", "UID");
        grid.Columns.Add("reader", "Reader");
        grid.Columns.Add("time", "Tijd");
        grid.Columns.Add("typed", "Getypt");
        grid.Columns[0].FillWeight = 35;
        grid.Columns[1].FillWeight = 130;
        grid.Columns[2].FillWeight = 170;
        grid.Columns[3].FillWeight = 125;
        grid.Columns[4].FillWeight = 60;
    }

    private static void StylePrimaryButton(Button button)
    {
        button.BackColor = Branding.AccentColor;
        button.ForeColor = Color.White;
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.Cursor = Cursors.Hand;
    }

    private static void StyleSecondaryButton(Button button)
    {
        button.BackColor = Branding.CardColor;
        button.ForeColor = Branding.PrimaryTextColor;
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 1;
        button.FlatAppearance.BorderColor = Branding.SecondaryAccentColor;
        button.Cursor = Cursors.Hand;
    }

    public void UpdateTyping(bool enabled)
    {
        typingLabel.Text = enabled ? "Typen: aan" : "Typen: gepauzeerd";
    }

    public void UpdateData(IEnumerable<ScanEntry> scans, string status, string reader, bool typingEnabled)
    {
        currentScans = scans.ToList();
        statusLabel.Text = $"Status: {status}";
        readerLabel.Text = $"Reader: {reader}";
        typingLabel.Text = typingEnabled ? "Typen: aan" : "Typen: gepauzeerd";
        countLabel.Text = $"{currentScans.Count} scans";

        if (currentScans.Count > 0)
        {
            latestUidLabel.Text = currentScans[0].Uid;
            copyLatestButton.Enabled = true;
        }
        else
        {
            latestUidLabel.Text = "Nog geen kaart gescand";
            copyLatestButton.Enabled = false;
        }

        grid.Rows.Clear();
        for (var i = 0; i < currentScans.Count; i++)
        {
            var scan = currentScans[i];
            grid.Rows.Add(
                currentScans.Count - i,
                scan.Uid,
                scan.Reader,
                scan.ScannedAt.ToString("dd-MM-yyyy HH:mm:ss"),
                scan.Typed ? "Ja" : "Nee"
            );
        }
    }
}
