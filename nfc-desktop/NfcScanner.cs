using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ACR122UScanner;

public sealed class NfcScanner : IDisposable
{
    private CancellationTokenSource? cancellation;
    private Task? scannerTask;
    private IntPtr context = IntPtr.Zero;
    private readonly object sync = new();

    private string lastEmittedUid = string.Empty;
    private DateTime lastEmittedAt = DateTime.MinValue;
    private string presentUid = string.Empty;
    private int emptyReadCount;

    private string currentReader = string.Empty;
    private string currentStatus = string.Empty;
    private int missingReaderCount;

    public event Action<string>? StatusChanged;
    public event Action<string>? ReaderChanged;
    public event Action<ScanEntry>? CardScanned;

    public int DuplicateBlockMs { get; set; } = 1000;

    public void Start()
    {
        Stop();
        cancellation = new CancellationTokenSource();
        scannerTask = Task.Run(() => Run(cancellation.Token));
    }

    public void Stop()
    {
        cancellation?.Cancel();
        cancellation = null;
    }

    private void Run(CancellationToken token)
    {
        var establish = NativePcsc.SCardEstablishContext(NativePcsc.SCARD_SCOPE_USER, IntPtr.Zero, IntPtr.Zero, out context);
        if (establish != NativePcsc.SCARD_S_SUCCESS)
        {
            SetStatus($"PC/SC kon niet starten. Code: {establish}");
            return;
        }

        SetStatus("Wachten op ACR122U reader...");

        while (!token.IsCancellationRequested)
        {
            try
            {
                var reader = FindPreferredReader();

                if (string.IsNullOrWhiteSpace(reader))
                {
                    missingReaderCount++;

                    // Alleen echt als losgekoppeld tonen na meerdere missers.
                    // Sommige ACR122U drivers geven heel kort geen reader terug tijdens polling.
                    if (missingReaderCount >= 4)
                    {
                        SetReader("Geen reader verbonden");
                        SetStatus("Sluit de ACR122U aan...");
                        presentUid = string.Empty;
                    }

                    Sleep(token, 750);
                    continue;
                }

                missingReaderCount = 0;
                SetReader(reader);

                var uid = TryReadUid(reader);

                if (string.IsNullOrWhiteSpace(uid))
                {
                    emptyReadCount++;

                    if (emptyReadCount >= 2)
                    {
                        presentUid = string.Empty;
                    }

                    SetStatus($"Reader verbonden: {reader}. Wachten op kaart...");
                    Sleep(token, 250);
                    continue;
                }

                emptyReadCount = 0;
                SetStatus($"Kaart gedetecteerd op {reader}");

                // Zelfde kaart die blijft liggen niet continu opnieuw scannen.
                // Dezelfde UID mag pas opnieuw nadat de kaart even weg is geweest.
                if (!string.Equals(uid, presentUid, StringComparison.OrdinalIgnoreCase))
                {
                    presentUid = uid;
                    EmitScan(reader, uid);
                }

                Sleep(token, 250);
            }
            catch (Exception ex)
            {
                SetStatus($"Scanner fout: {ex.Message}");
                Sleep(token, 1000);
            }
        }
    }

    private string FindPreferredReader()
    {
        var readers = ListReaders();
        return readers.FirstOrDefault(name => name.Contains("ACR122", StringComparison.OrdinalIgnoreCase))
               ?? readers.FirstOrDefault()
               ?? string.Empty;
    }

    private void SetStatus(string message)
    {
        if (message == currentStatus) return;
        currentStatus = message;
        StatusChanged?.Invoke(message);
    }

    private void SetReader(string name)
    {
        if (name == currentReader) return;
        currentReader = name;
        ReaderChanged?.Invoke(name);
    }

    private static void Sleep(CancellationToken token, int milliseconds)
    {
        try
        {
            Task.Delay(milliseconds, token).Wait(token);
        }
        catch
        {
            // ignored during shutdown
        }
    }

    private List<string> ListReaders()
    {
        var length = 0;
        var result = NativePcsc.SCardListReaders(context, null, IntPtr.Zero, ref length);
        if (result != NativePcsc.SCARD_S_SUCCESS || length <= 0) return new List<string>();

        var buffer = new char[length];
        result = NativePcsc.SCardListReaders(context, null, buffer, ref length);
        if (result != NativePcsc.SCARD_S_SUCCESS) return new List<string>();

        var raw = new string(buffer);
        return raw.Split('\0', StringSplitOptions.RemoveEmptyEntries).ToList();
    }

    private string TryReadUid(string reader)
    {
        var connect = NativePcsc.SCardConnect(
            context,
            reader,
            NativePcsc.SCARD_SHARE_SHARED,
            NativePcsc.SCARD_PROTOCOL_T0 | NativePcsc.SCARD_PROTOCOL_T1,
            out var card,
            out var protocol
        );

        // Geen kaart aanwezig is normaal; dat is geen reader disconnect.
        if (connect != NativePcsc.SCARD_S_SUCCESS) return string.Empty;

        try
        {
            var sendPci = new NativePcsc.SCARD_IO_REQUEST
            {
                dwProtocol = protocol,
                cbPciLength = (uint)System.Runtime.InteropServices.Marshal.SizeOf<NativePcsc.SCARD_IO_REQUEST>()
            };

            var command = new byte[] { 0xFF, 0xCA, 0x00, 0x00, 0x00 };
            var response = new byte[256];
            var responseLength = response.Length;

            var transmit = NativePcsc.SCardTransmit(
                card,
                ref sendPci,
                command,
                command.Length,
                IntPtr.Zero,
                response,
                ref responseLength
            );

            if (transmit != NativePcsc.SCARD_S_SUCCESS || responseLength < 3) return string.Empty;

            var sw1 = response[responseLength - 2];
            var sw2 = response[responseLength - 1];
            if (sw1 != 0x90 || sw2 != 0x00) return string.Empty;

            var uidBytes = response.Take(responseLength - 2).ToArray();
            return BitConverter.ToString(uidBytes).Replace("-", string.Empty).ToUpperInvariant();
        }
        finally
        {
            NativePcsc.SCardDisconnect(card, NativePcsc.SCARD_LEAVE_CARD);
        }
    }

    private void EmitScan(string reader, string uid)
    {
        lock (sync)
        {
            var now = DateTime.Now;
            if (uid == lastEmittedUid && (now - lastEmittedAt).TotalMilliseconds < DuplicateBlockMs) return;

            lastEmittedUid = uid;
            lastEmittedAt = now;

            CardScanned?.Invoke(new ScanEntry
            {
                Uid = uid,
                Reader = reader,
                ScannedAt = now
            });
        }
    }

    public void Dispose()
    {
        Stop();
        if (context != IntPtr.Zero)
        {
            NativePcsc.SCardReleaseContext(context);
            context = IntPtr.Zero;
        }
    }
}
