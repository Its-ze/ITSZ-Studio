param(
  [string]$Owner = "Its-ze",
  [string]$Repo = "ITSZ-Studio",
  [string]$Description = "ITSZ's Studio photo viewer and editor.",
  [string]$DefaultBranch = "main"
)

$ErrorActionPreference = "Stop"

function ConvertFrom-SecureToken {
  param([securestring]$SecureToken)

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureToken)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Get-GitHubToken {
  $envToken = [Environment]::GetEnvironmentVariable("GITHUB_TOKEN")
  if (-not [string]::IsNullOrWhiteSpace($envToken)) {
    return $envToken
  }

  $tokenFile = [Environment]::GetEnvironmentVariable("GITHUB_TOKEN_FILE")
  if ([string]::IsNullOrWhiteSpace($tokenFile)) {
    $tokenFile = Join-Path (Split-Path -Parent $PSScriptRoot) ".secrets\github-token.clixml"
  }

  if (Test-Path -LiteralPath $tokenFile) {
    $storedToken = Import-Clixml -LiteralPath $tokenFile
    if ($storedToken -is [securestring]) {
      return ConvertFrom-SecureToken $storedToken
    }
  }

  throw "Set GITHUB_TOKEN or run scripts\save-github-token.ps1 before running. The token needs repo permissions."
}

function Invoke-Git {
  param([string[]]$Arguments)

  & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Invoke-GitPushWithToken {
  param(
    [string]$Token,
    [string]$Branch
  )

  $askPass = Join-Path ([System.IO.Path]::GetTempPath()) "itsz-git-askpass-$PID.cmd"
  @"
@echo off
echo %~1 | findstr /I "Username" >nul
if not errorlevel 1 (
  echo x-access-token
  exit /b 0
)
echo %ITSZ_GITHUB_TOKEN%
"@ | Set-Content -LiteralPath $askPass -Encoding ASCII

  $oldAskPass = [Environment]::GetEnvironmentVariable("GIT_ASKPASS", "Process")
  $oldPrompt = [Environment]::GetEnvironmentVariable("GIT_TERMINAL_PROMPT", "Process")
  $oldToken = [Environment]::GetEnvironmentVariable("ITSZ_GITHUB_TOKEN", "Process")

  try {
    [Environment]::SetEnvironmentVariable("GIT_ASKPASS", $askPass, "Process")
    [Environment]::SetEnvironmentVariable("GIT_TERMINAL_PROMPT", "0", "Process")
    [Environment]::SetEnvironmentVariable("ITSZ_GITHUB_TOKEN", $Token, "Process")
    Invoke-Git @("push", "-u", "origin", $Branch)
  } finally {
    [Environment]::SetEnvironmentVariable("GIT_ASKPASS", $oldAskPass, "Process")
    [Environment]::SetEnvironmentVariable("GIT_TERMINAL_PROMPT", $oldPrompt, "Process")
    [Environment]::SetEnvironmentVariable("ITSZ_GITHUB_TOKEN", $oldToken, "Process")
    Remove-Item -LiteralPath $askPass -Force -ErrorAction SilentlyContinue
  }
}

$token = Get-GitHubToken

$headers = @{
  Authorization = "Bearer $token"
  Accept = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
}

$me = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/user"
$body = @{
  name = $Repo
  description = $Description
  private = $false
  has_issues = $true
  has_projects = $false
  has_wiki = $false
  auto_init = $false
} | ConvertTo-Json

try {
  if ($Owner -eq $me.login) {
    $created = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/user/repos" -Method Post -Body $body -ContentType "application/json"
  } else {
    $created = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/orgs/$Owner/repos" -Method Post -Body $body -ContentType "application/json"
  }
} catch {
  $statusCode = $_.Exception.Response.StatusCode.value__
  if ($statusCode -ne 422) {
    throw
  }
  Write-Warning "Repository $Owner/$Repo already exists. Reusing it."
  $created = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$Owner/$Repo"
}

if (-not (Test-Path -LiteralPath ".git")) {
  Invoke-Git @("init", "-b", $DefaultBranch)
} else {
  Invoke-Git @("branch", "-M", $DefaultBranch)
}

$gitName = (& git config user.name) 2>$null
if ([string]::IsNullOrWhiteSpace($gitName)) {
  Invoke-Git @("config", "user.name", $me.login)
}

$gitEmail = (& git config user.email) 2>$null
if ([string]::IsNullOrWhiteSpace($gitEmail)) {
  Invoke-Git @("config", "user.email", "$($me.id)+$($me.login)@users.noreply.github.com")
}

Invoke-Git @("add", ".")
$pendingChanges = & git status --porcelain
if ($pendingChanges) {
  Invoke-Git @("commit", "-m", "Update ITSZ Studio public release scaffold")
} else {
  Write-Host "No local changes to commit."
}

$remoteExists = (& git remote) -contains "origin"
if ($remoteExists) {
  Invoke-Git @("remote", "set-url", "origin", $created.clone_url)
} else {
  Invoke-Git @("remote", "add", "origin", $created.clone_url)
}

Invoke-GitPushWithToken -Token $token -Branch $DefaultBranch

$repoOwner = $created.owner.login
$repoName = $created.name
$pagesBody = @{
  build_type = "workflow"
} | ConvertTo-Json

try {
  Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$repoOwner/$repoName/pages" -Method Post -Body $pagesBody -ContentType "application/json" | Out-Null
  Write-Host "Enabled GitHub Pages with GitHub Actions deployments."
} catch {
  Write-Warning "Could not enable GitHub Pages automatically. Enable Pages from repository settings if needed. Error: $($_.Exception.Message)"
}

Write-Host "Created public repository: $($created.html_url)"
Write-Host "Push a tag like v0.1.0 to build installers and publish the Pages download site."
