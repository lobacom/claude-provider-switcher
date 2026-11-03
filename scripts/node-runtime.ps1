# Optional CLI bootstrap only. Never loaded by the VS Code extension.
function Test-ProviderNode([string]$NodeExe) {
  if (-not $NodeExe -or -not (Test-Path -LiteralPath $NodeExe -PathType Leaf)) { return $false }
  try {
    $major = & $NodeExe -p 'parseInt(process.versions.node)' 2>$null
    return $LASTEXITCODE -eq 0 -and "$major" -match '^\d+$' -and [int]$major -ge 18
  } catch { return $false }
}

function Resolve-ProviderNode([string]$InstallRoot, [switch]$PrivateNode, [switch]$NoNodeDownload) {
  if (-not $PrivateNode) {
    $existing = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($existing -and (Test-ProviderNode $existing.Source)) { return $existing.Source }
  }
  $runtimeRoot = Join-Path $InstallRoot 'runtime'
  $nodeExe = Join-Path $runtimeRoot 'node.exe'
  if (Test-ProviderNode $nodeExe) { return $nodeExe }
  if ($NoNodeDownload) { throw 'Node.js 18+ was not found and downloads are disabled. Install Node.js or run without -NoNodeDownload.' }

  $osArch = $env:PROCESSOR_ARCHITEW6432
  if (-not $osArch) { $osArch = $env:PROCESSOR_ARCHITECTURE }
  $arch = switch ($osArch) { 'AMD64' { 'x64' } 'ARM64' { 'arm64' } 'x86' { 'x86' } default { throw "Unsupported Windows architecture: $osArch" } }
  # Current patch of the supported Node 24 LTS line, directly from nodejs.org.
  $baseUrl = 'https://nodejs.org/dist/latest-v24.x'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
  $downloadId = [guid]::NewGuid().ToString('N')
  $manifest = Join-Path $runtimeRoot "$downloadId-shasums.txt"
  $archive = Join-Path $runtimeRoot "$downloadId-node.zip"
  $pendingNode = Join-Path $runtimeRoot "$downloadId-node.exe"
  try {
    Write-Host 'Node.js not found (or private runtime requested). Downloading Node 24 LTS from nodejs.org...'
    Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/SHASUMS256.txt" -OutFile $manifest
    $pattern = '^([a-fA-F0-9]{64})\s+(node-v24\.\d+\.\d+-win-' + $arch + '\.zip)$'
    $lines = @(Get-Content -LiteralPath $manifest | Where-Object { $_ -match $pattern })
    if ($lines.Count -ne 1 -or $lines[0] -notmatch $pattern) { throw "No official Node 24 LTS download for Windows $arch." }
    $expectedHash = $Matches[1]
    $archiveName = $Matches[2]
    Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$archiveName" -OutFile $archive
    $sha = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($archive)
    try { $actualHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $sha.Dispose() }
    if ($actualHash -ne $expectedHash) { throw 'Node.js download failed SHA-256 verification.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($archive)
    try {
      $entry = $zip.GetEntry(($archiveName -replace '\.zip$', '') + '/node.exe')
      if (-not $entry) { throw 'The official Node.js archive contains no node.exe.' }
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $pendingNode, $true)
    } finally { $zip.Dispose() }
    if (-not (Test-ProviderNode $pendingNode)) { throw 'The downloaded Node.js runtime could not start on this computer.' }
    Move-Item -LiteralPath $pendingNode -Destination $nodeExe -Force
    Write-Host "Private Node.js runtime installed: $nodeExe"
    return $nodeExe
  } finally {
    # Only these three generated files are removed; no recursive directory cleanup.
    foreach ($file in @($manifest, $archive, $pendingNode)) {
      if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
    }
  }
}
