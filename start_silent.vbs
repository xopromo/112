Dim WshShell
Set WshShell = CreateObject("WScript.Shell")

' Переходим в папку скрипта
WshShell.CurrentDirectory = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)

' Проверяем — уже запущен?
Dim oExec
Set oExec = WshShell.Exec("cmd /c netstat -aon | find "":5001""")
Dim result
result = oExec.StdOut.ReadAll()

If InStr(result, ":5001") > 0 Then
    WshShell.Run "cmd /c start http://localhost:5001", 0, False
    MsgBox "Сервер уже запущен!" & Chr(13) & "Открываю браузер...", 64, "VK Sales Bot"
Else
    ' Установка зависимостей при первом запуске
    If Not CreateObject("Scripting.FileSystemObject").FolderExists("venv") Then
        WshShell.Run "cmd /c python -m venv venv && venv\Scripts\pip install --upgrade pip >nul && venv\Scripts\pip install vk-api flask apscheduler", 1, True
    End If

    ' Запускаем сервер в фоне (окно не появляется)
    WshShell.Run "venv\Scripts\pythonw.exe -c ""import sys; sys.path.insert(0,'.'); from vk_sales.web_app import run_web; run_web()""", 0, False

    ' Ждём 2 секунды и открываем браузер
    WshShell.Run "cmd /c timeout /t 2 >nul && start http://localhost:5001", 0, False

    MsgBox "VK Sales Bot запущен!" & Chr(13) & Chr(13) & "Браузер откроется автоматически." & Chr(13) & "Для остановки — запусти stop.bat", 64, "VK Sales Bot"
End If
