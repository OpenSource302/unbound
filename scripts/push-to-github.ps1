# Push Unbound to github.com/OpenSource302/unbound
# Usage:
#   Option A (token): $env:GH_TOKEN = "ghp_..." ; .\scripts\push-to-github.ps1
#   Option B (gh login): gh auth login first, then .\scripts\push-to-github.ps1

$ErrorActionPreference = "Stop"
$env:Path = "C:\Program Files\GitHub CLI;C:\Program Files\nodejs;" + $env:Path

Set-Location (Join-Path $PSScriptRoot "..")

if ($env:GH_TOKEN) {
    Write-Host "Authenticating with GH_TOKEN..."
    $env:GH_TOKEN | gh auth login --with-token
}

gh auth status
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Not logged in. Run ONE of:"
    Write-Host "  gh auth login --hostname github.com --git-protocol https --web"
    Write-Host "  `$env:GH_TOKEN = 'ghp_YOUR_TOKEN'; .\scripts\push-to-github.ps1"
    exit 1
}

$login = gh api user -q .login
Write-Host "Logged in as: $login"

$exists = gh repo view OpenSource302/unbound 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating public repo OpenSource302/unbound..."
    gh repo create unbound --public --description "Open Twitter clone — no censorship, creators with stake"
}

git remote remove origin 2>$null
git remote add origin https://github.com/OpenSource302/unbound.git
git push -u origin main

Write-Host ""
Write-Host "Live at: https://github.com/OpenSource302/unbound"