#Requires -Version 5.1
<#
.SYNOPSIS
Install the standalone arrow-key provider switcher for the current user.
.EXAMPLE
  .\install.ps1
.EXAMPLE
  .\install.ps1 -Prefix 'D:\Apps\Provider Switcher' -NoPath
#>
[CmdletBinding()]
param([string]$Prefix, [string]$BinDir, [switch]$NoPath, [switch]$PrivateNode, [switch]$NoNodeDownload)
$ErrorActionPreference = 'Stop'

if (-not $Prefix) {
  $localDir = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE 'AppData\Local' }
  $Prefix = Join-Path $localDir 'Programs\claude-provider-switcher'
}
$Prefix = [IO.Path]::GetFullPath($Prefix)
. (Join-Path $PSScriptRoot 'scripts\node-runtime.ps1')
$nodeExe = Resolve-ProviderNode -InstallRoot $Prefix -PrivateNode:$PrivateNode -NoNodeDownload:$NoNodeDownload
$installerArgs = @((Join-Path $PSScriptRoot 'cli\install.js'), '--json')
$installerArgs += @('--prefix', $Prefix)
if ($BinDir) { $installerArgs += @('--bin-dir', $BinDir) }
$resultText = & $nodeExe @installerArgs
if ($LASTEXITCODE -ne 0) { throw 'CLI installation failed.' }
$installed = $resultText | ConvertFrom-Json

if (-not $NoPath) {
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $entries = @($userPath -split ';' | Where-Object { $_ })
  $normalizedEntries = @($entries | ForEach-Object { $_.TrimEnd('\') })
  if ($normalizedEntries -notcontains $installed.binDir.TrimEnd('\')) {
    [Environment]::SetEnvironmentVariable('Path', (($entries + $installed.binDir) -join ';'), 'User')
  }
  $sessionEntries = @($env:Path -split ';' | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\') })
  if ($sessionEntries -notcontains $installed.binDir.TrimEnd('\')) {
    $env:Path = $installed.binDir + ';' + $env:Path
  }
}
Write-Host "Installed claude-providers $($installed.version)" -ForegroundColor Green
Write-Host "Command: $($installed.command)"
if ($NoPath) { Write-Host "Add to PATH: $($installed.binDir)" }
else { Write-Host 'Open a new terminal and run claude-providers (or run it in this PowerShell session).' }
