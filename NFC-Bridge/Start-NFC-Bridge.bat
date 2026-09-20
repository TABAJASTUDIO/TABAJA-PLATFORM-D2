@echo off
setlocal
cd /d "%~dp0"

:: LAN/mobile mode needs permission to listen on the PC network interface.
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting Administrator permission for Samsung / LAN access...
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title Tabaja NFC Bridge - PC + Samsung LAN
netsh advfirewall firewall delete rule name="Tabaja Solution LAN 8766" >nul 2>&1
netsh advfirewall firewall add rule name="Tabaja Solution LAN 8766" dir=in action=allow protocol=TCP localport=8766 profile=private >nul 2>&1

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Tabaja-NFC-Bridge.ps1"
echo.
echo NFC Bridge stopped. Press any key to close.
pause >nul
