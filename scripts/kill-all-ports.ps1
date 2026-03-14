param(
    [int]$AfterSeconds = 0,
    [switch]$IncludeUDP = $false,
    [switch]$Force = $true
)

if ($AfterSeconds -gt 0) {
    Write-Output "Waiting $AfterSeconds second(s) before killing listening processes..."
    Start-Sleep -Seconds $AfterSeconds
}

try {
    $tcpPids = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
} catch {
    Write-Warning "Unable to enumerate TCP listeners: $_"
    $tcpPids = @()
}

$udpPids = @()
if ($IncludeUDP) {
    try {
        $udpPids = Get-NetUDPEndpoint -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    } catch {
        Write-Warning "Unable to enumerate UDP endpoints: $_"
        $udpPids = @()
    }
}

$pids = ($tcpPids + $udpPids) | Where-Object { $_ -ne $null } | Sort-Object -Unique

if (-not $pids -or $pids.Count -eq 0) {
    Write-Output "No listening processes found. Nothing to kill."
    exit 0
}

Write-Output "Found listening PIDs: $($pids -join ', ')"

foreach ($pid in $pids) {
    try {
        if ($Force) { Stop-Process -Id $pid -Force -ErrorAction Stop }
        else { Stop-Process -Id $pid -ErrorAction Stop }
        Write-Output "Stopped PID $pid"
    } catch {
        Write-Warning "Failed to stop PID $pid: $_"
    }
}
