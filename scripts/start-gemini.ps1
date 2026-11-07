# Servidor local de tokens efemeros, nao acessivel de outros dispositivos.
$ErrorActionPreference='Stop'
# Windows PowerShell 5.1: ProtectedData está no assembly System.Security.
Add-Type -AssemblyName System.Security
$existing=Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue
if($existing){Write-Host 'Ponte Gemini ja iniciada.';exit 0}
$folder=Join-Path $env:LOCALAPPDATA 'HorizontePlay'
$file=Join-Path $folder 'gemini-key.dpapi'
$key=''
try{
 if(Test-Path $file){
  $data=[Convert]::FromBase64String([System.IO.File]::ReadAllText($file))
  $plain=[System.Security.Cryptography.ProtectedData]::Unprotect(
   $data,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
  $key=[System.Text.Encoding]::UTF8.GetString($plain)
  [Array]::Clear($plain,0,$plain.Length)
 }
 $env:GEMINI_API_KEY=$key
 $root=Split-Path -Parent $PSScriptRoot
 $entry=Join-Path $root 'server\gemini-local.mjs'
 Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @('"' + $entry + '"') -WorkingDirectory $root -WindowStyle Hidden
 Write-Host ('Ponte local iniciada. Chave configurada: '+[bool]$key)
}finally{
 Remove-Item Env:\GEMINI_API_KEY -ErrorAction SilentlyContinue
 $key=$null
}
