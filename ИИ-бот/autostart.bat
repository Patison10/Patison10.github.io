@echo off
rem Adds the bot to Windows startup (runs when you log in).
set LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\BarbershopBot.lnk
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%LNK%'); $s.TargetPath='%~dp0start.bat'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
echo Done. The bot will start automatically after you log in.
pause
