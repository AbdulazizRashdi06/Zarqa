# Set one value in the server's deploy/.env from a hidden prompt, then restart the API.
# Run from the repo root in PowerShell:  .\deploy\set-secret.ps1 RESEND_API_KEY
param([Parameter(Mandatory = $true)][string]$Name)

if ($Name -notmatch '^[A-Z][A-Z0-9_]*$') { Write-Host "Name must look like RESEND_API_KEY"; exit 1 }

$secure = Read-Host "Paste the value for $Name (hidden), then press Enter" -AsSecureString
$value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()

if (-not $value) { Write-Host "Nothing entered; nothing changed."; exit 1 }
if ($Name -eq 'RESEND_API_KEY' -and ($value -notmatch '^re_' -or $value.Length -lt 20)) {
    Write-Host "That doesn't look like a Resend key (they start with re_). Nothing changed."; exit 1
}

# The value travels over SSH stdin, never as a command-line argument.
$remote = @"
set -e
cd /opt/zarqa
VALUE=`$(cat | tr -d '\r\n')
touch deploy/.env && chmod 600 deploy/.env
grep -v '^$Name=' deploy/.env > deploy/.env.new || true
printf '%s=%s\n' '$Name' "`$VALUE" >> deploy/.env.new
mv deploy/.env.new deploy/.env && chmod 600 deploy/.env
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d api >/dev/null 2>&1
echo "$Name saved on the server (`${#VALUE} characters); API restarted."
"@
$value | & ssh -i "$env:USERPROFILE\.ssh\zarqa_vps" -o BatchMode=yes deploy@173.249.40.122 ($remote -replace "`r", "")
