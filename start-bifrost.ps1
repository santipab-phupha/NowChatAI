Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Run a local-only gateway with provider credentials inherited from .env.local.
# No API key is written to the configuration file or command line.
$projectDir = $PSScriptRoot
$runtimeDir = Join-Path $projectDir '.bifrost'
$envFile = Join-Path $projectDir '.env.local'
if (@(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue).Count -gt 0) {
  throw 'Port 8080 is already in use. Stop the existing process or reuse the existing Bifrost gateway.'
}
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Create mockup/.env.local with OPENAI_API_KEY first.' }
$entries = @(Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*OPENAI_API_KEY\s*=' })
if ($entries.Count -ne 1) { throw 'Expected exactly one OPENAI_API_KEY entry in .env.local.' }
$openaiKey = (($entries[0] -split '=', 2)[1]).Trim().Trim('"').Trim("'")
if (-not $openaiKey) { throw 'OPENAI_API_KEY is empty.' }

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$configPath = Join-Path $runtimeDir 'config.json'
if (-not (Test-Path -LiteralPath $configPath)) {
  $config = @{
    config_store = @{ enabled = $false }
    logs_store = @{ enabled = $false }
    client = @{ enable_logging = $false; disable_content_logging = $true }
    providers = @{ openai = @{ keys = @(@{ name = 'nowchat-openai'; value = 'env.OPENAI_API_KEY'; models = @('*'); weight = 1.0 }) } }
  }
  $config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $configPath -Encoding utf8
}
try {
  $existingConfig = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $configuredKeys = @($existingConfig.providers.openai.keys)
  if ($existingConfig.config_store.enabled -ne $false -or $existingConfig.logs_store.enabled -ne $false -or
      $existingConfig.client.enable_logging -ne $false -or $existingConfig.client.disable_content_logging -ne $true -or
      $configuredKeys.Count -ne 1 -or $configuredKeys[0].value -ne 'env.OPENAI_API_KEY') { throw 'Unexpected configuration.' }
} catch {
  throw 'Bifrost config is invalid or differs from the expected local privacy configuration. Review .bifrost/config.json before starting.'
}

$nodePath = (Get-Command node).Source
$npxCli = Join-Path (Split-Path $nodePath -Parent) 'node_modules\npm\bin\npx-cli.js'
if (-not (Test-Path -LiteralPath $npxCli)) { throw 'Node.js npm launcher was not found.' }
$argsList = @(('"{0}"' -f $npxCli), '-y', '@maximhq/bifrost', '--transport-version', 'v2.5.1', '-host', '127.0.0.1', '-port', '8080', '-app-dir', '.bifrost', '-log-level', 'error')
$oldKey = [Environment]::GetEnvironmentVariable('OPENAI_API_KEY', 'Process')
try {
  [Environment]::SetEnvironmentVariable('OPENAI_API_KEY', $openaiKey, 'Process')
  $process = Start-Process -FilePath $nodePath -ArgumentList $argsList -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'stdout.log') -RedirectStandardError (Join-Path $runtimeDir 'stderr.log') -PassThru
} finally {
  [Environment]::SetEnvironmentVariable('OPENAI_API_KEY', $oldKey, 'Process')
  $openaiKey = $null
}
Write-Output "Bifrost launcher started (PID $($process.Id)). Gateway: http://127.0.0.1:8080"
Write-Output 'After your computer restarts, rerun this script before starting the NowChatAI server.'
