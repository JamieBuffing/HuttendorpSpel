using System;
using System.Runtime.InteropServices;

namespace ACR122UScanner;

public static class NativePcsc
{
    public const uint SCARD_SCOPE_USER = 0;
    public const uint SCARD_SHARE_SHARED = 2;
    public const uint SCARD_PROTOCOL_T0 = 1;
    public const uint SCARD_PROTOCOL_T1 = 2;
    public const int SCARD_STATE_UNAWARE = 0x0000;
    public const int SCARD_STATE_EMPTY = 0x0010;
    public const int SCARD_STATE_PRESENT = 0x0020;
    public const int SCARD_STATE_CHANGED = 0x0002;
    public const int SCARD_STATE_IGNORE = 0x0001;
    public const int SCARD_STATE_UNAVAILABLE = 0x0008;
    public const int SCARD_LEAVE_CARD = 0;
    public const int SCARD_S_SUCCESS = 0;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct SCARD_READERSTATE
    {
        public string szReader;
        public IntPtr pvUserData;
        public uint dwCurrentState;
        public uint dwEventState;
        public uint cbAtr;

        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 36)]
        public byte[] rgbAtr;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SCARD_IO_REQUEST
    {
        public uint dwProtocol;
        public uint cbPciLength;
    }

    [DllImport("winscard.dll")]
    public static extern int SCardEstablishContext(
        uint dwScope,
        IntPtr pvReserved1,
        IntPtr pvReserved2,
        out IntPtr phContext
    );

    [DllImport("winscard.dll")]
    public static extern int SCardReleaseContext(IntPtr hContext);

    [DllImport("winscard.dll", CharSet = CharSet.Unicode)]
    public static extern int SCardListReaders(
        IntPtr hContext,
        string? groups,
        IntPtr readers,
        ref int pcchReaders
    );

    [DllImport("winscard.dll", CharSet = CharSet.Unicode)]
    public static extern int SCardListReaders(
        IntPtr hContext,
        string? groups,
        char[] readers,
        ref int pcchReaders
    );

    [DllImport("winscard.dll", CharSet = CharSet.Unicode)]
    public static extern int SCardGetStatusChange(
        IntPtr hContext,
        uint dwTimeout,
        [In, Out] SCARD_READERSTATE[] rgReaderStates,
        uint cReaders
    );

    [DllImport("winscard.dll", CharSet = CharSet.Unicode)]
    public static extern int SCardConnect(
        IntPtr hContext,
        string szReader,
        uint dwShareMode,
        uint dwPreferredProtocols,
        out IntPtr phCard,
        out uint pdwActiveProtocol
    );

    [DllImport("winscard.dll")]
    public static extern int SCardDisconnect(IntPtr hCard, int dwDisposition);

    [DllImport("winscard.dll")]
    public static extern int SCardTransmit(
        IntPtr hCard,
        ref SCARD_IO_REQUEST pioSendPci,
        byte[] pbSendBuffer,
        int cbSendLength,
        IntPtr pioRecvPci,
        byte[] pbRecvBuffer,
        ref int pcbRecvLength
    );
}
