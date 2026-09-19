' 桃園市立圖書館 ‧ 中壢分館書目智慧檢索系統 - 背景靜默啟動器
' 此腳本可避免跳出黑色命令提示字元視窗，降低防毒軟體誤判機率。

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)

' 切換工作目錄至專案根目錄
WshShell.CurrentDirectory = currentDir

' 延遲 2 秒後以預設瀏覽器開啟系統介面 (0 = 隱藏執行黑窗)
WshShell.Run "cmd /c timeout /t 2 /nobreak > nul && start http://localhost:8765", 0, False

' 啟動 Python 後端伺服器 (0 = 隱藏黑窗，背景執行)
WshShell.Run "python server.py", 0, False
