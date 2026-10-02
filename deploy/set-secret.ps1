# Set one value in the server's deploy/.env from a hidden prompt, then restart the API.
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File .\deploy\set-secret.ps1 RESEND_API_KEY
param([Parameter(Mandatory = $true)][string]$Name)

if ($Name -notmatch '^[A-Z][A-Z0-9_]*$') { Write-Host "Name must look like RESEND_API_KEY"; exit 1 }

$secure = Read-Host "Paste the value for $Name (hidden), then press Enter" -AsSecureString
$value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()

if (-not $value) { Write-Host "Nothing entered; nothing changed."; exit 1 }
if ($Name -eq 'RESEND_API_KEY' -and ($value -notmatch '^re_' -or $value.Length -lt 20)) {
    Write-Host "That doesn't look like a Resend key (they start with re_). Nothing changed."; exit 1
}

# The value travels over SSH stdin; the server-side script (deploy/set-env-remote.sh) stores it.
$value | & ssh -i "$env:USERPROFILE\.ssh\zarqa_vps" -o BatchMode=yes deploy@173.249.40.122 bash /opt/zarqa/deploy/set-env-remote.sh $Name
