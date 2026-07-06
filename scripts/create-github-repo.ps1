# Creates a public GitHub repo and pushes The Pit
# Requires: GitHub CLI (gh) — install via winget install GitHub.cli

param(
    [string]$RepoName = "the-pit",
    [string]$Description = "Decentralized Nostr-style social network with creator revenue sharing — fully open source"
)

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "GitHub CLI not found. Install: winget install GitHub.cli"
    Write-Host ""
    Write-Host "Manual steps:"
    Write-Host "  1. Go to https://github.com/new"
    Write-Host "  2. Name: $RepoName, Public, no README"
    Write-Host "  3. Run:"
    Write-Host "     git remote add origin https://github.com/YOUR_USERNAME/$RepoName.git"
    Write-Host "     git push -u origin main"
    exit 1
}

gh auth status
if ($LASTEXITCODE -ne 0) {
    Write-Host "Run: gh auth login"
    exit 1
}

gh repo create $RepoName --public --source=. --remote=origin --description="$Description" --push
Write-Host "Done: https://github.com/$(gh api user -q .login)/$RepoName"