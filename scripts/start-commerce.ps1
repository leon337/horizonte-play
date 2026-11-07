# Um unico servidor MCP central para todas as cafeterias do Horizonte.
# Nenhuma chave API é necessária para o comércio fictício.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$entry = Join-Path $root 'server\commerce-mcp.mjs'
$existing = Get-NetTCPConnection -LocalPort 4180 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($existing) {
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$existing.OwningProcess)" -ErrorAction SilentlyContinue
  if ($owner -and $owner.CommandLine -match 'commerce-mcp[.]mjs') {
    Write-Host 'Servidor MCP Commerce já está ativo (porta 4180).'
    exit 0
  }
  throw 'Porta 4180 ocupada por outra aplicação.'
}
Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @('"' + $entry + '"') -WorkingDirectory $root -WindowStyle Hidden
Start-Sleep -Milliseconds 600
try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4180/health' -TimeoutSec 4
  if (-not $health.online) { throw 'Servidor não retornou online.' }
  Write-Host 'Servidor central MCP iniciado na porta 4180 (lojas fictícias).'
} catch {
  throw 'Não foi possível iniciar o servidor Commerce MCP.'
}
