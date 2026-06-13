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

  $askPassCmd = Join-Path ([System.IO.Path]::GetTempPath()) "itsz-git-askpass-$PID.cmd"
  $askPassPs1 = Join-Path ([System.IO.Path]::GetTempPath()) "itsz-git-askpass-$PID.ps1"
  @'
param([string]$Prompt)
if ($Prompt -match "Username") {
  [Console]::Out.WriteLine("x-access-token")
} else {
  [Console]::Out.WriteLine($env:ITSZ_GITHUB_TOKEN)
}
'@ | Set-Content -LiteralPath $askPassPs1 -Encoding UTF8
  @"
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$askPassPs1" "%~1"
"@ | Set-Content -LiteralPath $askPassCmd -Encoding ASCII

  $oldAskPass = [Environment]::GetEnvironmentVariable("GIT_ASKPASS", "Process")
  $oldPrompt = [Environment]::GetEnvironmentVariable("GIT_TERMINAL_PROMPT", "Process")
  $oldToken = [Environment]::GetEnvironmentVariable("ITSZ_GITHUB_TOKEN", "Process")

  try {
    [Environment]::SetEnvironmentVariable("GIT_ASKPASS", $askPassCmd, "Process")
    [Environment]::SetEnvironmentVariable("GIT_TERMINAL_PROMPT", "0", "Process")
    [Environment]::SetEnvironmentVariable("ITSZ_GITHUB_TOKEN", $Token, "Process")
    Invoke-Git @("push", "-u", "origin", $Branch)
  } finally {
    [Environment]::SetEnvironmentVariable("GIT_ASKPASS", $oldAskPass, "Process")
    [Environment]::SetEnvironmentVariable("GIT_TERMINAL_PROMPT", $oldPrompt, "Process")
    [Environment]::SetEnvironmentVariable("ITSZ_GITHUB_TOKEN", $oldToken, "Process")
    Remove-Item -LiteralPath $askPassCmd -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $askPassPs1 -Force -ErrorAction SilentlyContinue
  }
}

function Ensure-GitHubPagesTagPolicy {
  param(
    [hashtable]$Headers,
    [string]$RepoOwner,
    [string]$RepoName
  )

  $policyUri = "https://api.github.com/repos/$RepoOwner/$RepoName/environments/github-pages/deployment-branch-policies"
  try {
    $policies = Invoke-RestMethod -Headers $Headers -Uri $policyUri
    $hasReleaseTagPolicy = $policies.branch_policies | Where-Object { $_.name -eq "v*" -and $_.type -eq "tag" } | Select-Object -First 1
    if ($hasReleaseTagPolicy) {
      Write-Host "GitHub Pages already allows v* release tags."
      return
    }

    $tagPolicyBody = @{
      name = "v*"
      type = "tag"
    } | ConvertTo-Json
    Invoke-RestMethod -Headers $Headers -Uri $policyUri -Method Post -Body $tagPolicyBody -ContentType "application/json" | Out-Null
    Write-Host "Allowed v* release tags to deploy GitHub Pages."
  } catch {
    Write-Warning "Could not configure the GitHub Pages v* tag deployment policy. Add it in repository environment settings if tag releases cannot deploy Pages. Error: $($_.Exception.Message)"
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

Ensure-GitHubPagesTagPolicy -Headers $headers -RepoOwner $repoOwner -RepoName $repoName

Write-Host "Created public repository: $($created.html_url)"
Write-Host "Push a tag like v0.1.0 to build installers and publish the Pages download site."
