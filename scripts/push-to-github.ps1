# Push The Pit to github.com/opensource302/the-pit
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

$exists = gh repo view opensource302/the-pit 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating public repo opensource302/the-pit..."
    gh repo create the-pit --public --description "Decentralized Nostr-style social network with creator revenue sharing"
}

git remote remove origin 2>$null
git remote add origin https://github.com/opensource302/the-pit.git
git push -u origin main

Write-Host ""
Write-Host "Live at: https://github.com/opensource302/the-pit"