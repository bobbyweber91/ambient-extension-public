<#
.SYNOPSIS
    Build the Ambient extension and publish a GitHub Release to the public repo.

.DESCRIPTION
    1. Runs `npm run build` in ambient_extension/
    2. Zips the dist/ folder into ambient_extension_v{VERSION}.zip
    3. Copies source files to the public repo clone
    4. Commits, tags, and pushes
    5. Creates a GitHub Release with the zip attached (requires gh CLI)

.PARAMETER SkipBuild
    Skip the npm build step (use existing dist/).

.PARAMETER NoPush
    Stop after committing locally -- don't push or create a release.
#>
param(
    [switch]$SkipBuild,
    [switch]$NoPush
)

$ErrorActionPreference = "Stop"

$privateRoot  = $PSScriptRoot
$extDir       = Join-Path $privateRoot "ambient_extension"
$distDir      = Join-Path $extDir "dist"
$publicRepo   = "C:\Users\theco\ambient\ambient_extension_public"

$manifest = Get-Content (Join-Path $extDir "manifest.json") -Raw | ConvertFrom-Json
$version  = $manifest.version
$tag      = "v$version"
$zipName  = "ambient_extension_v${version}.zip"
$zipPath  = Join-Path $privateRoot $zipName

Write-Host ""
Write-Host "=== Ambient Extension Release - $tag ===" -ForegroundColor Cyan

# --- Step 1: Build ---
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "[1/5] Building extension..." -ForegroundColor Yellow
    Push-Location $extDir
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed" }
    Pop-Location
} else {
    Write-Host ""
    Write-Host "[1/5] Skipping build (using existing dist/)" -ForegroundColor DarkGray
}

# --- Step 2: Zip dist/ ---
Write-Host ""
Write-Host "[2/5] Creating $zipName..." -ForegroundColor Yellow
if (Test-Path $zipPath) { Remove-Item $zipPath }
Compress-Archive -Path "$distDir\*" -DestinationPath $zipPath -Force
$zipSize = (Get-Item $zipPath).Length
$zipSizeFormatted = '{0:N0}' -f $zipSize
Write-Host "       Created: $zipPath ($zipSizeFormatted bytes)"

# --- Step 3: Sync source to public repo ---
Write-Host ""
Write-Host "[3/5] Syncing files to public repo..." -ForegroundColor Yellow

$sourceItems = @(
    @{ Src = (Join-Path $privateRoot "ambient_extension"); Dst = (Join-Path $publicRepo "ambient_extension") },
    @{ Src = (Join-Path $privateRoot "extension_endpoint"); Dst = (Join-Path $publicRepo "extension_endpoint") },
    @{ Src = (Join-Path $privateRoot "__init__.py");        Dst = (Join-Path $publicRepo "__init__.py") },
    @{ Src = (Join-Path $privateRoot "README.md");          Dst = (Join-Path $publicRepo "README.md") }
)

foreach ($item in $sourceItems) {
    if (Test-Path $item.Src -PathType Container) {
        if (Test-Path $item.Dst) { Remove-Item $item.Dst -Recurse -Force }
        Copy-Item $item.Src $item.Dst -Recurse -Exclude @("node_modules", ".git")
    } else {
        Copy-Item $item.Src $item.Dst -Force
    }
}
Write-Host "       Synced to: $publicRepo"

# --- Step 4: Commit & push ---
Write-Host ""
Write-Host "[4/5] Committing changes..." -ForegroundColor Yellow
Push-Location $publicRepo
git add -A
$status = git status --porcelain
if ($status) {
    git commit -m "Release $tag"
} else {
    Write-Host "       No changes to commit"
}

if ($NoPush) {
    Write-Host "       Skipping push (NoPush flag set)" -ForegroundColor DarkGray
    Pop-Location
    Write-Host ""
    Write-Host "Done (local only). Zip at: $zipPath" -ForegroundColor Green
    exit 0
}

git tag -f $tag
git push origin main
git push origin $tag --force
Pop-Location
Write-Host "       Pushed $tag to origin"

# --- Step 5: GitHub Release ---
Write-Host ""
Write-Host "[5/5] Creating GitHub Release..." -ForegroundColor Yellow
$ghAvailable = Get-Command gh -ErrorAction SilentlyContinue
if ($ghAvailable) {
    Push-Location $publicRepo
    $releaseNotes = "Download ``$zipName``, unzip, and load as an unpacked extension in Chrome. See the README for full instructions."
    $oldPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    gh release view $tag 2>$null | Out-Null
    $releaseExists = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $oldPref
    if ($releaseExists) {
        Write-Host "       Release $tag already exists - uploading asset..."
        gh release upload $tag $zipPath --clobber
    } else {
        gh release create $tag $zipPath --title "Ambient Extension $tag" --notes $releaseNotes --latest
    }
    Pop-Location
    Write-Host ""
    Write-Host "Release published!" -ForegroundColor Green
    Write-Host "  https://github.com/bobbyweber91/ambient-extension-public/releases/tag/$tag"
} else {
    Write-Host "       gh CLI not found - skipping auto-release." -ForegroundColor DarkYellow
    Write-Host "       To install: winget install --id GitHub.cli" -ForegroundColor DarkYellow
    Write-Host ""
    Write-Host "       Manual steps:" -ForegroundColor White
    Write-Host "       1. Go to https://github.com/bobbyweber91/ambient-extension-public/releases/new"
    Write-Host "       2. Tag: $tag   Title: Ambient Extension $tag"
    Write-Host "       3. Attach: $zipPath"
    Write-Host "       4. Publish"
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
