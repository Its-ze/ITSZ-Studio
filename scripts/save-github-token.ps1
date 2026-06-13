param(
  [string]$SecretPath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SecretPath)) {
  $projectRoot = Split-Path -Parent $PSScriptRoot
  $SecretPath = Join-Path $projectRoot ".secrets\github-token.clixml"
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "Save GitHub Token"
$form.Size = New-Object System.Drawing.Size(560, 230)
$form.StartPosition = "CenterScreen"
$form.TopMost = $true
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false

$label = New-Object System.Windows.Forms.Label
$label.AutoSize = $true
$label.Location = New-Object System.Drawing.Point(18, 18)
$label.Text = "Paste a GitHub token with repo and Pages/Admin permissions:"
$form.Controls.Add($label)

$tokenBox = New-Object System.Windows.Forms.TextBox
$tokenBox.Location = New-Object System.Drawing.Point(22, 50)
$tokenBox.Size = New-Object System.Drawing.Size(500, 26)
$tokenBox.UseSystemPasswordChar = $true
$form.Controls.Add($tokenBox)

$showBox = New-Object System.Windows.Forms.CheckBox
$showBox.Location = New-Object System.Drawing.Point(22, 84)
$showBox.Size = New-Object System.Drawing.Size(160, 24)
$showBox.Text = "Show token"
$showBox.Add_CheckedChanged({
  $tokenBox.UseSystemPasswordChar = -not $showBox.Checked
})
$form.Controls.Add($showBox)

$pathLabel = New-Object System.Windows.Forms.Label
$pathLabel.Location = New-Object System.Drawing.Point(18, 116)
$pathLabel.Size = New-Object System.Drawing.Size(510, 35)
$pathLabel.Text = "Saved encrypted for this Windows user at: $SecretPath"
$form.Controls.Add($pathLabel)

$okButton = New-Object System.Windows.Forms.Button
$okButton.Location = New-Object System.Drawing.Point(344, 154)
$okButton.Size = New-Object System.Drawing.Size(86, 30)
$okButton.Text = "Save"
$okButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.AcceptButton = $okButton
$form.Controls.Add($okButton)

$cancelButton = New-Object System.Windows.Forms.Button
$cancelButton.Location = New-Object System.Drawing.Point(436, 154)
$cancelButton.Size = New-Object System.Drawing.Size(86, 30)
$cancelButton.Text = "Cancel"
$cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.CancelButton = $cancelButton
$form.Controls.Add($cancelButton)

$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
  Write-Host "Token save canceled."
  exit 2
}

$token = $tokenBox.Text.Trim()
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "No token was entered."
}

$secretDir = Split-Path -Parent $SecretPath
New-Item -ItemType Directory -Force -Path $secretDir | Out-Null

$secureToken = ConvertTo-SecureString $token -AsPlainText -Force
$secureToken | Export-Clixml -LiteralPath $SecretPath

Write-Host "Saved encrypted GitHub token to $SecretPath"
