namespace ACR122UScanner;

public sealed class ScanEntry
{
    public string Uid { get; set; } = string.Empty;
    public string Reader { get; set; } = string.Empty;
    public DateTime ScannedAt { get; set; } = DateTime.Now;
    public bool Typed { get; set; }
}
