# Uso: copiar sua chave Gemini no Windows e executar este script local.
# A chave nao aparece no console nem e armazenada no repositorio.
$ErrorActionPreference='Stop'
# Windows PowerShell 5.1: ProtectedData está no assembly System.Security.
Add-Type -AssemblyName System.Security
$key=(Get-Clipboard -Raw -ErrorAction Stop).Trim()
if($key -notmatch '^(?:AIza[A-Za-z0-9_-]{20,}|AQ\.[A-Za-z0-9_-]{20,})$'){
 Write-Host 'Clipboard sem chave Gemini valida. Copie a chave completa e tente novamente.' -ForegroundColor Yellow
 exit 2
}
$dir=Join-Path $env:LOCALAPPDATA 'HorizontePlay'
New-Item -ItemType Directory -Path $dir -Force|Out-Null
$plain=[System.Text.Encoding]::UTF8.GetBytes($key)
$encrypted=[System.Security.Cryptography.ProtectedData]::Protect(
 $plain,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[System.IO.File]::WriteAllText((Join-Path $dir 'gemini-key.dpapi'),
 [Convert]::ToBase64String($encrypted))
[Array]::Clear($plain,0,$plain.Length)
$key=$null
Write-Host 'Chave salva com protecao DPAPI do Windows. Nao sera enviada ao GitHub.' -ForegroundColor Green
# Reinicia APENAS nosso backend, sem interferir em outros processos Node.
$listener=Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue|Select-Object -First 1
if($listener){
 $processId=[int]$listener.OwningProcess
 $process=Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
 if($process -and $process.CommandLine -match 'gemini-local[.]mjs'){
  Stop-Process -Id $processId -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 400
 }
}
& (Join-Path $PSScriptRoot 'start-gemini.ps1')
