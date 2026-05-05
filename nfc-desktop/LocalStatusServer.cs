using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace ACR122UScanner;

public sealed class LocalStatusServer : IDisposable
{
    public const int Port = 47832;

    private readonly Func<LocalStatusSnapshot> snapshotProvider;
    private readonly CancellationTokenSource cancellationTokenSource = new();
    private TcpListener? listener;
    private Task? listenerTask;

    public bool IsRunning { get; private set; }

    public LocalStatusServer(Func<LocalStatusSnapshot> snapshotProvider)
    {
        this.snapshotProvider = snapshotProvider;
    }

    public void Start()
    {
        if (IsRunning)
        {
            return;
        }

        try
        {
            listener = new TcpListener(IPAddress.Loopback, Port);
            listener.Start();
            IsRunning = true;
            listenerTask = Task.Run(() => ListenLoopAsync(cancellationTokenSource.Token));
        }
        catch
        {
            IsRunning = false;
            listener = null;
        }
    }

    private async Task ListenLoopAsync(CancellationToken cancellationToken)
    {
        if (listener == null)
        {
            return;
        }

        while (!cancellationToken.IsCancellationRequested)
        {
            TcpClient? client = null;

            try
            {
                client = await listener.AcceptTcpClientAsync(cancellationToken);
                _ = Task.Run(() => HandleClientAsync(client, cancellationToken), cancellationToken);
            }
            catch (OperationCanceledException)
            {
                client?.Dispose();
                break;
            }
            catch
            {
                client?.Dispose();
            }
        }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken cancellationToken)
    {
        using var clientDispose = client;

        try
        {
            using var stream = client.GetStream();
            var buffer = new byte[2048];
            var bytesRead = await stream.ReadAsync(buffer, cancellationToken);
            var requestText = Encoding.ASCII.GetString(buffer, 0, bytesRead);
            var firstLine = requestText.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None)[0];

            if (firstLine.StartsWith("OPTIONS ", StringComparison.OrdinalIgnoreCase))
            {
                await WriteResponseAsync(stream, "", "text/plain", "204 No Content", cancellationToken);
                return;
            }

            if (!firstLine.StartsWith("GET /status ", StringComparison.OrdinalIgnoreCase) &&
                !firstLine.StartsWith("GET / ", StringComparison.OrdinalIgnoreCase))
            {
                await WriteResponseAsync(stream, "Not found", "text/plain", "404 Not Found", cancellationToken);
                return;
            }

            var snapshot = snapshotProvider();
            var body = JsonSerializer.Serialize(new
            {
                ok = true,
                app = Branding.AppName,
                brand = Branding.BrandName,
                status = snapshot.Status,
                reader = snapshot.Reader,
                typingEnabled = snapshot.TypingEnabled,
                scans = snapshot.ScanCount,
                port = Port
            });

            await WriteResponseAsync(stream, body, "application/json", "200 OK", cancellationToken);
        }
        catch
        {
            // Een lokale status-check mag de scanner nooit stoppen.
        }
    }

    private static async Task WriteResponseAsync(NetworkStream stream, string body, string contentType, string status, CancellationToken cancellationToken)
    {
        var bodyBytes = Encoding.UTF8.GetBytes(body);
        var header =
            $"HTTP/1.1 {status}\r\n" +
            "Access-Control-Allow-Origin: *\r\n" +
            "Access-Control-Allow-Methods: GET, OPTIONS\r\n" +
            "Access-Control-Allow-Headers: Content-Type\r\n" +
            "Cache-Control: no-store\r\n" +
            $"Content-Type: {contentType}; charset=utf-8\r\n" +
            $"Content-Length: {bodyBytes.Length}\r\n" +
            "Connection: close\r\n" +
            "\r\n";

        var headerBytes = Encoding.UTF8.GetBytes(header);
        await stream.WriteAsync(headerBytes, cancellationToken);
        await stream.WriteAsync(bodyBytes, cancellationToken);
    }

    public void Dispose()
    {
        try
        {
            cancellationTokenSource.Cancel();
            listener?.Stop();
            cancellationTokenSource.Dispose();
        }
        catch
        {
            // negeren bij afsluiten
        }
    }
}

public sealed record LocalStatusSnapshot(
    string Status,
    string Reader,
    bool TypingEnabled,
    int ScanCount
);
