using System.Drawing;
using System.Windows.Forms;

namespace ACR122UScanner;

public sealed class ThemedCardPanel : Panel
{
    public Color BorderColor { get; set; } = Branding.SecondaryAccentColor;
    public int BorderThickness { get; set; } = 1;

    public ThemedCardPanel()
    {
        DoubleBuffered = true;
        BackColor = Branding.CardColor;
        Padding = new Padding(1);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        using var pen = new Pen(BorderColor, BorderThickness);
        var rect = ClientRectangle;
        rect.Width -= 1;
        rect.Height -= 1;
        e.Graphics.DrawRectangle(pen, rect);
    }
}
