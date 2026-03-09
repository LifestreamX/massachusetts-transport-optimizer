# Comprehensive 1000+ Test Suite for Route Optimization
# Tests all station combinations to verify routing accuracy

# Read station data
$redLineStations = @(
    "Alewife", "Davis", "Porter", "Harvard", "Central", "Kendall/MIT", 
    "Charles/MGH", "Park Street", "Downtown Crossing", "South Station", 
    "Broadway", "Andrew", "JFK/UMass", "North Quincy", "Wollaston", 
    "Quincy Center", "Quincy Adams", "Braintree", "Savin Hill", 
    "Fields Corner", "Shawmut", "Ashmont"
)

$orangeLineStations = @(
    "Oak Grove", "Malden Center", "Wellington", "Assembly", "Sullivan Square",
    "Community College", "North Station", "Haymarket", "State", "Downtown Crossing",
    "Chinatown", "Tufts Medical Center", "Back Bay", "Massachusetts Avenue",
    "Ruggles", "Roxbury Crossing", "Jackson Square", "Stony Brook", 
    "Green Street", "Forest Hills"
)

$blueLineStations = @(
    "Wonderland", "Revere Beach", "Beachmont", "Suffolk Downs", "Orient Heights",
    "Wood Island", "Airport", "Maverick", "Aquarium", "State", "Government Center", "Bowdoin"
)

$greenLineBStations = @(
    "Park Street", "Boylston", "Arlington", "Copley", "Hynes Convention Center",
    "Kenmore", "Blandford Street", "Boston University East", "Boston University Central",
    "Boston University West", "Saint Paul Street", "Pleasant Street", "Babcock Street",
    "Packards Corner", "Harvard Avenue", "Griggs Street", "Allston Street",
    "Warren Street", "Washington Street", "Sutherland Road", "Chiswick Road",
    "Chestnut Hill Avenue", "South Street", "Boston College"
)

$greenLineCStations = @(
    "North Station", "Haymarket", "Government Center", "Park Street", "Boylston",
    "Arlington", "Copley", "Hynes Convention Center", "Kenmore", "Saint Marys Street",
    "Hawes Street", "Kent Street", "Saint Paul Street", "Coolidge Corner",
    "Summit Avenue", "Brandon Hall", "Fairbanks Street", "Washington Square",
    "Tappan Street", "Dean Road", "Englewood Avenue", "Cleveland Circle"
)

$greenLineDStations = @(
    "North Station", "Haymarket", "Government Center", "Park Street", "Boylston",
    "Arlington", "Copley", "Hynes Convention Center", "Kenmore", "Fenway",
    "Longwood", "Brookline Village", "Brookline Hills", "Beaconsfield",
    "Reservoir", "Chestnut Hill", "Newton Centre", "Newton Highlands",
    "Eliot", "Waban", "Woodland", "Riverside"
)

$greenLineEStations = @(
    "Lechmere", "Science Park", "North Station", "Haymarket", "Government Center",
    "Park Street", "Boylston", "Arlington", "Copley", "Prudential",
    "Symphony", "Northeastern University", "Museum of Fine Arts", "Longwood Medical Area",
    "Brigham Circle", "Fenwood Road", "Mission Park", "Riverway",
    "Back of the Hill", "Heath Street"
)

$testResults = @()
$passed = 0
$failed = 0
$totalTests = 0

Write-Host "`n=== COMPREHENSIVE 1000+ TEST SUITE ===" -ForegroundColor Cyan
Write-Host "Generating and running comprehensive route tests...`n" -ForegroundColor Cyan

function Test-Route {
    param(
        [string]$Origin,
        [string]$Destination,
        [string[]]$ExpectedLines
    )
    
    $script:totalTests++
    
    try {
        $body = @{
            origin = $Origin
            destination = $Destination
            preference = "fastest"
        } | ConvertTo-Json
        
        $result = Invoke-RestMethod -Uri "http://localhost:3000/api/optimize-route" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
        
        $returnedLines = $result.routes | ForEach-Object { $_.routeName }
        $returnedLinesStr = if ($returnedLines) { ($returnedLines -join ", ") } else { "(none)" }
        $expectedLinesStr = if ($ExpectedLines.Count -gt 0) { ($ExpectedLines -join ", ") } else { "(none)" }
        
        # Validation logic
        $isValid = $false
        if ($ExpectedLines.Count -eq 0) {
            $isValid = ($returnedLines.Count -eq 0)
        } elseif ($returnedLines.Count -gt 0) {
            $allValid = $true
            foreach ($line in $returnedLines) {
                if ($ExpectedLines -notcontains $line) {
                    $allValid = $false
                    break
                }
            }
            $hasExpected = $false
            foreach ($expectedLine in $ExpectedLines) {
                if ($returnedLines -contains $expectedLine) {
                    $hasExpected = $true
                    break
                }
            }
            $isValid = $allValid -and $hasExpected
        }
        
        if ($isValid) {
            $script:passed++
            $script:testResults += [PSCustomObject]@{
                Origin = $Origin
                Destination = $Destination
                Expected = $expectedLinesStr
                Returned = $returnedLinesStr
                Status = "PASS"
            }
        } else {
            Write-Host "FAIL: $Origin to $Destination" -ForegroundColor Red
            Write-Host "  Expected: $expectedLinesStr" -ForegroundColor Yellow
            Write-Host "  Returned: $returnedLinesStr" -ForegroundColor Red
            $script:failed++
            $script:testResults += [PSCustomObject]@{
                Origin = $Origin
                Destination = $Destination
                Expected = $expectedLinesStr
                Returned = $returnedLinesStr
                Status = "FAIL"
            }
        }
    } catch {
        Write-Host "ERROR: $Origin to $Destination" -ForegroundColor Red
        $script:failed++
    }
}

# Test all Red Line combinations
Write-Host "Testing Red Line combinations..." -ForegroundColor Yellow
for ($i = 0; $i -lt $redLineStations.Count; $i++) {
    for ($j = 0; $j -lt $redLineStations.Count; $j++) {
        if ($i -ne $j) {
            Test-Route -Origin $redLineStations[$i] -Destination $redLineStations[$j] -ExpectedLines @("Red Line")
        }
    }
}

# Test all Orange Line combinations
Write-Host "Testing Orange Line combinations..." -ForegroundColor Yellow
for ($i = 0; $i -lt $orangeLineStations.Count; $i++) {
    for ($j = 0; $j -lt $orangeLineStations.Count; $j++) {
        if ($i -ne $j) {
            Test-Route -Origin $orangeLineStations[$i] -Destination $orangeLineStations[$j] -ExpectedLines @("Orange Line")
        }
    }
}

# Test all Blue Line combinations
Write-Host "Testing Blue Line combinations..." -ForegroundColor Yellow
for ($i = 0; $i -lt $blueLineStations.Count; $i++) {
    for ($j = 0; $j -lt $blueLineStations.Count; $j++) {
        if ($i -ne $j) {
            Test-Route -Origin $blueLineStations[$i] -Destination $blueLineStations[$j] -ExpectedLines @("Blue Line")
        }
    }
}

# Test Green Line B combinations
Write-Host "Testing Green Line B combinations..." -ForegroundColor Yellow
for ($i = 0; $i -lt $greenLineBStations.Count; $i++) {
    for ($j = 0; $j -lt $greenLineBStations.Count; $j++) {
        if ($i -ne $j) {
            Test-Route -Origin $greenLineBStations[$i] -Destination $greenLineBStations[$j] -ExpectedLines @("Green Line B")
        }
    }
}

# Test Green Line C combinations
Write-Host "Testing Green Line C combinations..." -ForegroundColor Yellow
for ($i = 0; $i -lt $greenLineCStations.Count; $i++) {
    for ($j = 0; $j -lt $greenLineCStations.Count; $j++) {
        if ($i -ne $j) {
            Test-Route -Origin $greenLineCStations[$i] -Destination $greenLineCStations[$j] -ExpectedLines @("Green Line C")
        }
    }
}

# Test Green Line D combinations
Write-Host "Testing Green Line D combinations..." -ForegroundColor Yellow
for ($i = 0; $i -lt $greenLineDStations.Count; $i++) {
    for ($j = 0; $j -lt $greenLineDStations.Count; $j++) {
        if ($i -ne $j) {
            Test-Route -Origin $greenLineDStations[$i] -Destination $greenLineDStations[$j] -ExpectedLines @("Green Line D")
        }
    }
}

# Test Green Line E combinations
Write-Host "Testing Green Line E combinations..." -ForegroundColor Yellow
for ($i = 0; $i -lt $greenLineEStations.Count; $i++) {
    for ($j = 0; $j -lt $greenLineEStations.Count; $j++) {
        if ($i -ne $j) {
            Test-Route -Origin $greenLineEStations[$i] -Destination $greenLineEStations[$j] -ExpectedLines @("Green Line E")
        }
    }
}

# Test cross-line combinations (should return empty)
Write-Host "Testing cross-line combinations (no direct routes)..." -ForegroundColor Yellow
$crossLineTests = @(
    @{From=$redLineStations; To=$blueLineStations},
    @{From=$redLineStations; To=$greenLineBStations},
    @{From=$orangeLineStations; To=$blueLineStations},
    @{From=$blueLineStations; To=$greenLineBStations}
)

foreach ($testSet in $crossLineTests) {
    # Sample 10 combinations from each cross-line test
    for ($i = 0; $i -lt [Math]::Min(10, $testSet.From.Count); $i++) {
        for ($j = 0; $j -lt [Math]::Min(10, $testSet.To.Count); $j++) {
            Test-Route -Origin $testSet.From[$i] -Destination $testSet.To[$j] -ExpectedLines @()
        }
    }
}

Write-Host "`n=== FINAL TEST SUMMARY ===" -ForegroundColor Cyan
Write-Host "Total Tests: $totalTests" -ForegroundColor White
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })

if ($totalTests -gt 0) {
    Write-Host "Success Rate: $([math]::Round($passed / $totalTests * 100, 2))%`n" -ForegroundColor Cyan
}

if ($failed -gt 0) {
    Write-Host "`n=== FAILED TESTS ===" -ForegroundColor Red
    $testResults | Where-Object { $_.Status -ne "PASS" } | Format-Table -AutoSize
}

$testResults | Export-Csv -Path "comprehensive-test-results.csv" -NoTypeInformation
Write-Host "Full results exported to comprehensive-test-results.csv" -ForegroundColor Cyan

if ($failed -eq 0) {
    Write-Host "`nALL TESTS PASSED!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`nSOME TESTS FAILED" -ForegroundColor Red
    exit 1
}
