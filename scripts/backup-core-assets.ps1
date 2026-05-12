param(
    [string]$DestinationRoot = "",
    [string]$UserDataPath = ""
)

$ErrorActionPreference = "Stop"

function Join-Chars {
    param([int[]]$Codes)
    return -join ($Codes | ForEach-Object { [char]$_ })
}

function Get-DefaultDestinationRoot {
    $companySystem = Join-Chars @(0x516C, 0x53F8, 0x7CFB, 0x7D71)
    $sourceData = Join-Chars @(0x539F, 0x59CB, 0x8CC7, 0x6599)
    return Join-Path $env:USERPROFILE "OneDrive\Developer $companySystem\TanChin-Time-Clock-SQLite3 $sourceData"
}

function Get-DefaultUserDataPath {
    return Join-Path $env:APPDATA "TanChin-Time-Clock-SQLite3"
}

function Get-UpdateLogFileName {
    $updateLogName = Join-Chars @(0x66F4, 0x65B0, 0x7D00, 0x9304)
    return "$updateLogName.md"
}

function Get-FullPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [System.IO.Path]::GetFullPath($Path)
}

function Assert-ChildPath {
    param(
        [Parameter(Mandatory = $true)][string]$ChildPath,
        [Parameter(Mandatory = $true)][string]$ParentPath
    )

    $child = Get-FullPath $ChildPath
    $parent = Get-FullPath $ParentPath
    if (-not $parent.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
        $parent = "$parent$([System.IO.Path]::DirectorySeparatorChar)"
    }
    if (-not $child.StartsWith($parent, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Safety check failed: staging path is outside the allowed temp root."
    }
}

function Copy-ExistingItem {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source)) {
        return $false
    }

    $destinationParent = Split-Path -Parent $Destination
    if ($destinationParent) {
        New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
    }

    Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
    return $true
}

if ([string]::IsNullOrWhiteSpace($DestinationRoot)) {
    $DestinationRoot = Get-DefaultDestinationRoot
}

if ([string]::IsNullOrWhiteSpace($UserDataPath)) {
    $UserDataPath = Get-DefaultUserDataPath
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Get-FullPath (Join-Path $scriptRoot "..")
$destinationRootFull = Get-FullPath $DestinationRoot
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$packageName = "TanChin-Time-Clock-SQLite3-core-assets-$timestamp"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "TanChin-TimeClock-CoreBackups"
$stagingDir = Join-Path $tempRoot $packageName
$zipPath = Join-Path $destinationRootFull "$packageName.zip"
$updateLogFileName = Get-UpdateLogFileName

Assert-ChildPath -ChildPath $stagingDir -ParentPath $tempRoot

if (Test-Path -LiteralPath $stagingDir) {
    Remove-Item -LiteralPath $stagingDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
New-Item -ItemType Directory -Force -Path $destinationRootFull | Out-Null

$projectBackupRoot = Join-Path $stagingDir "project-source"
$runtimeBackupRoot = Join-Path $stagingDir "runtime-user-data"
$copiedProjectItems = New-Object System.Collections.Generic.List[string]
$copiedRuntimeItems = New-Object System.Collections.Generic.List[string]
$missingItems = New-Object System.Collections.Generic.List[string]

$projectDirectories = @(
    "assets",
    "browser-client",
    "docs",
    "modals",
    "renderer-scripts",
    "scripts"
)

$projectFiles = @(
    "attendance-export.js",
    "database.js",
    "icon.ico",
    "icon.png",
    "index.html",
    "main.js",
    "package-lock.json",
    "package.json",
    "package.json.txt",
    "preload.js",
    "server.js",
    "tailwind.config.js"
)

foreach ($directory in $projectDirectories) {
    $source = Join-Path $projectRoot $directory
    $destination = Join-Path $projectBackupRoot $directory
    if (Copy-ExistingItem -Source $source -Destination $destination) {
        $copiedProjectItems.Add($directory) | Out-Null
    } else {
        $missingItems.Add("project:$directory") | Out-Null
    }
}

foreach ($file in $projectFiles) {
    $source = Join-Path $projectRoot $file
    $destination = Join-Path $projectBackupRoot $file
    if (Copy-ExistingItem -Source $source -Destination $destination) {
        $copiedProjectItems.Add($file) | Out-Null
    } else {
        $missingItems.Add("project:$file") | Out-Null
    }
}

$documentPatterns = @("*.txt", "*.md", "*.csv", "*.xlsx", "*.docx")
foreach ($pattern in $documentPatterns) {
    Get-ChildItem -Path $projectRoot -Filter $pattern -File -ErrorAction SilentlyContinue | ForEach-Object {
        $destination = Join-Path $projectBackupRoot $_.Name
        Copy-ExistingItem -Source $_.FullName -Destination $destination | Out-Null
        $copiedProjectItems.Add($_.Name) | Out-Null
    }
}

if (Test-Path -LiteralPath $UserDataPath) {
    Get-ChildItem -Path $UserDataPath -Filter "app_data.db*" -File -ErrorAction SilentlyContinue | ForEach-Object {
        $destination = Join-Path $runtimeBackupRoot $_.Name
        Copy-ExistingItem -Source $_.FullName -Destination $destination | Out-Null
        $copiedRuntimeItems.Add($_.Name) | Out-Null
    }

    $runtimeDirectories = @(
        "CustomSounds",
        "ThemeImages",
        "AuditArchives",
        "logs"
    )

    foreach ($directory in $runtimeDirectories) {
        $source = Join-Path $UserDataPath $directory
        $destination = Join-Path $runtimeBackupRoot $directory
        if (Copy-ExistingItem -Source $source -Destination $destination) {
            $copiedRuntimeItems.Add($directory) | Out-Null
        }
    }
} else {
    $missingItems.Add("runtime:$UserDataPath") | Out-Null
}

$manifest = [ordered]@{
    created_at = (Get-Date).ToString("o")
    package_name = $packageName
    project_root = $projectRoot
    runtime_user_data = $UserDataPath
    destination = $zipPath
    update_log = "project-source/docs/$updateLogFileName"
    copied_project_items = @($copiedProjectItems)
    copied_runtime_items = @($copiedRuntimeItems)
    missing_items = @($missingItems)
    excluded_items = @(
        "node_modules",
        "dist",
        "Cache",
        "Code Cache",
        "GPUCache",
        "DawnGraphiteCache",
        "DawnWebGPUCache",
        "blob_storage",
        "Network",
        "Session Storage",
        "Local Storage"
    )
}

$manifestPath = Join-Path $stagingDir "backup-manifest.json"
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath -Force

$zipItem = Get-Item -LiteralPath $zipPath
Write-Host "Core asset backup completed."
Write-Host "Output file: $($zipItem.FullName)"
Write-Host "File size: $([Math]::Round($zipItem.Length / 1MB, 2)) MB"
Write-Host "Included update log: project-source/docs/$updateLogFileName"

