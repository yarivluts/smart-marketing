<#
.SYNOPSIS
Reads one secret from this project's Secret Manager and writes the value to stdout.

.DESCRIPTION
The PowerShell twin of get-secret.sh, for agents and humans on a Windows shell. The
single sanctioned way to obtain a GrowthOS credential: no credential is ever committed,
written to a dotfile, or pasted into a chat transcript — the value lives in exactly one
place and is fetched at the moment of use.

Never redirect the output into a file, a log, or another agent's context. Assign it to a
variable in the process that needs it and let it die with that process.

.EXAMPLE
$token = ./scripts/secrets/get-secret.ps1 jira-api-token
#>
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$SecretName
)

$project = if ($env:GROWTHOS_GCP_PROJECT) { $env:GROWTHOS_GCP_PROJECT } else { 'growthos-g2w84' }

<#
The Cloud SDK ships two entrypoints in the same directory: `gcloud.cmd` and an
extensionless POSIX `gcloud` shell script. `Get-Command gcloud` resolves to the latter,
which Windows cannot execute — it returns nothing at all and leaves $LASTEXITCODE unset,
so a naive call looks like an authentication failure. Always prefer the .cmd here.
#>
$gcloud = $null
foreach ($candidate in @('gcloud.cmd', 'gcloud')) {
    $resolved = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($resolved) {
        $gcloud = $resolved.Source
        break
    }
}
if (-not $gcloud) {
    Write-Error 'gcloud is not on PATH. Install the Google Cloud CLI, then run: gcloud auth application-default login'
    exit 1
}

# gcloud is a native executable, so its stderr is left alone: redirecting it in
# PowerShell 5.1 wraps each line in an ErrorRecord and flips $? even on success.
$value = & $gcloud secrets versions access latest --secret=$SecretName --project=$project
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($value)) {
    Write-Error "Could not read secret `"$SecretName`" from project $project. Check that you are authenticated (gcloud auth application-default login), that the secret exists (gcloud secrets list --project $project), and that your account holds roles/secretmanager.secretAccessor on it."
    exit 1
}

Write-Output $value
