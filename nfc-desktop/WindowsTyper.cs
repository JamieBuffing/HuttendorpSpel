using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace ACR122UScanner;

public static class WindowsTyper
{
    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_UNICODE = 0x0004;
    private const ushort VK_RETURN = 0x0D;

    public static void TypeUid(string uid, bool pressEnter)
    {
        if (string.IsNullOrWhiteSpace(uid)) return;

        // Geef Windows heel kort tijd om de focus op het actieve veld te houden.
        Thread.Sleep(80);

        foreach (var character in uid.Trim().ToUpperInvariant())
        {
            SendUnicodeCharacter(character);
            Thread.Sleep(8);
        }

        if (pressEnter)
        {
            SendVirtualKey(VK_RETURN);
        }
    }

    private static void SendUnicodeCharacter(char character)
    {
        var inputs = new[]
        {
            new INPUT
            {
                type = INPUT_KEYBOARD,
                u = new InputUnion
                {
                    ki = new KEYBDINPUT
                    {
                        wVk = 0,
                        wScan = (ushort)character,
                        dwFlags = KEYEVENTF_UNICODE,
                        time = 0,
                        dwExtraInfo = UIntPtr.Zero
                    }
                }
            },
            new INPUT
            {
                type = INPUT_KEYBOARD,
                u = new InputUnion
                {
                    ki = new KEYBDINPUT
                    {
                        wVk = 0,
                        wScan = (ushort)character,
                        dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                        time = 0,
                        dwExtraInfo = UIntPtr.Zero
                    }
                }
            }
        };

        SendInputChecked(inputs);
    }

    private static void SendVirtualKey(ushort virtualKey)
    {
        var inputs = new[]
        {
            new INPUT
            {
                type = INPUT_KEYBOARD,
                u = new InputUnion
                {
                    ki = new KEYBDINPUT
                    {
                        wVk = virtualKey,
                        wScan = 0,
                        dwFlags = 0,
                        time = 0,
                        dwExtraInfo = UIntPtr.Zero
                    }
                }
            },
            new INPUT
            {
                type = INPUT_KEYBOARD,
                u = new InputUnion
                {
                    ki = new KEYBDINPUT
                    {
                        wVk = virtualKey,
                        wScan = 0,
                        dwFlags = KEYEVENTF_KEYUP,
                        time = 0,
                        dwExtraInfo = UIntPtr.Zero
                    }
                }
            }
        };

        SendInputChecked(inputs);
    }

    private static void SendInputChecked(INPUT[] inputs)
    {
        var inputSize = Marshal.SizeOf<INPUT>();
        var sent = SendInput((uint)inputs.Length, inputs, inputSize);

        if (sent != inputs.Length)
        {
            var error = Marshal.GetLastWin32Error();
            throw new InvalidOperationException($"SendInput failed. Sent {sent}/{inputs.Length}. Win32 code: {error}. Input size: {inputSize}");
        }
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint type;
        public InputUnion u;
    }

    // De union moet óók MOUSEINPUT bevatten. Anders wordt INPUT op 64-bit te klein
    // en geeft SendInput Win32 code 87: invalid parameter.
    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct HARDWAREINPUT
    {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }
}
