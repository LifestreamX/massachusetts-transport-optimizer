# Comprehensive Route Testing Script
# Tests many station combinations to verify routing accuracy

$testCases = @(
    # Red Line only tests
    @{Origin="Quincy Center"; Destination="South Station"; ExpectedLines=@("Red Line")},
    @{Origin="Quincy Center"; Destination="Park Street"; ExpectedLines=@("Red Line")},
    @{Origin="Quincy Center"; Destination="Alewife"; ExpectedLines=@("Red Line")},
    @{Origin="Braintree"; Destination="Downtown Crossing"; ExpectedLines=@("Red Line")},
    @{Origin="Ashmont"; Destination="Kendall/MIT"; ExpectedLines=@("Red Line")},
    @{Origin="Wollaston"; Destination="Harvard"; ExpectedLines=@("Red Line")},
    @{Origin="Quincy Adams"; Destination="Central"; ExpectedLines=@("Red Line")},
    @{Origin="North Quincy"; Destination="Porter"; ExpectedLines=@("Red Line")},
    @{Origin="JFK/UMass"; Destination="Davis"; ExpectedLines=@("Red Line")},
    @{Origin="Andrew"; Destination="Alewife"; ExpectedLines=@("Red Line")},
    
    # Orange Line only tests
    @{Origin="Oak Grove"; Destination="Forest Hills"; ExpectedLines=@("Orange Line")},
    @{Origin="Malden Center"; Destination="Back Bay"; ExpectedLines=@("Orange Line")},
    @{Origin="Wellington"; Destination="Ruggles"; ExpectedLines=@("Orange Line")},
    @{Origin="Assembly"; Destination="Tufts Medical Center"; ExpectedLines=@("Orange Line")},
    @{Origin="Sullivan Square"; Destination="Chinatown"; ExpectedLines=@("Orange Line")},
    
    # Blue Line only tests
    @{Origin="Wonderland"; Destination="Bowdoin"; ExpectedLines=@("Blue Line")},
    @{Origin="Revere Beach"; Destination="Aquarium"; ExpectedLines=@("Blue Line")},
    @{Origin="Beachmont"; Destination="State"; ExpectedLines=@("Blue Line")},
    @{Origin="Suffolk Downs"; Destination="Maverick"; ExpectedLines=@("Blue Line")},
    @{Origin="Orient Heights"; Destination="Airport"; ExpectedLines=@("Blue Line")},
    
    # Green Line B only tests
    @{Origin="Boston College"; Destination="Park Street"; ExpectedLines=@("Green Line B")},
    @{Origin="Boston College"; Destination="Kenmore"; ExpectedLines=@("Green Line B")},
    @{Origin="Chestnut Hill Avenue"; Destination="Park Street"; ExpectedLines=@("Green Line B")},
    
    # Green Line C only tests
    @{Origin="Cleveland Circle"; Destination="North Station"; ExpectedLines=@("Green Line C")},
    @{Origin="Cleveland Circle"; Destination="Copley"; ExpectedLines=@("Green Line C")},
    @{Origin="Coolidge Corner"; Destination="Hynes Convention Center"; ExpectedLines=@("Green Line C")},
    
    # Green Line D only tests
    @{Origin="Riverside"; Destination="Government Center"; ExpectedLines=@("Green Line D")},
    @{Origin="Riverside"; Destination="Kenmore"; ExpectedLines=@("Green Line D")},
    @{Origin="Reservoir"; Destination="Copley"; ExpectedLines=@("Green Line D")},
    
    # Green Line E only tests
    @{Origin="Heath Street"; Destination="Lechmere"; ExpectedLines=@("Green Line E")},
    @{Origin="Heath Street"; Destination="Prudential"; ExpectedLines=@("Green Line E")},
    @{Origin="Brigham Circle"; Destination="Symphony"; ExpectedLines=@("Green Line E")},
    
    # Transfer station tests (should return multiple lines)
    @{Origin="Park Street"; Destination="Government Center"; ExpectedLines=@("Red Line", "Green Line B", "Green Line C", "Green Line D", "Green Line E")},
    @{Origin="Downtown Crossing"; Destination="State"; ExpectedLines=@("Red Line", "Orange Line")},
    @{Origin="Government Center"; Destination="State"; ExpectedLines=@("Blue Line", "Green Line B", "Green Line C", "Green Line D", "Green Line E")},
    
    # Same station tests (should return the line(s) serving that station)
    @{Origin="Quincy Center"; Destination="Quincy Center"; ExpectedLines=@("Red Line")},
    @{Origin="Park Street"; Destination="Park Street"; ExpectedLines=@("Red Line", "Green Line B", "Green Line C", "Green Line D", "Green Line E")},
    @{Origin="Downtown Crossing"; Destination="Downtown Crossing"; ExpectedLines=@("Red Line", "Orange Line")},
    
    # Mixed station tests across different lines (should return empty or require transfer)
    @{Origin="Quincy Center"; Destination="Oak Grove"; ExpectedLines=@()},
    @{Origin="Wonderland"; Destination="Forest Hills"; ExpectedLines=@()},
    @{Origin="Boston College"; Destination="Riverside"; ExpectedLines=@()},
    @{Origin="Ashmont"; Destination="Wonderland"; ExpectedLines=@()},
    
    # Edge cases
    @{Origin="Alewife"; Destination="Braintree"; ExpectedLines=@("Red Line")},
    @{Origin="Oak Grove"; Destination="Forest Hills"; ExpectedLines=@("Orange Line")},
    @{Origin="Wonderland"; Destination="Bowdoin"; ExpectedLines=@("Blue Line")}
)

$passed = 0
$failed = 0
$testResults = @()

Write-Host "`n=== COMPREHENSIVE ROUTE TESTING ===" -ForegroundColor Cyan
Write-Host "Running $($testCases.Count) test cases...`n" -ForegroundColor Cyan

foreach ($test in $testCases) {
    $body = @{
        origin = $test.Origin
        destination = $test.Destination
        preference = "fastest"
    } | ConvertTo-Json
    
    try {
        $result = Invoke-RestMethod -Uri "http://localhost:3000/api/optimize-route" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
        
        $returnedLines = $result.routes | ForEach-Object { $_.routeName }
        $returnedLinesStr = if ($returnedLines) { ($returnedLines -join ", ") } else { "(none)" }
        $expectedLinesStr = if ($test.ExpectedLines.Count -gt 0) { ($test.ExpectedLines -join ", ") } else { "(none)" }
        
        # Check if the returned lines match expected (allow for subset if multiple valid lines)
        $isValid = $false
        if ($test.ExpectedLines.Count -eq 0) {
            # Expecting no direct routes
            $isValid = ($returnedLines.Count -eq 0)
        } elseif ($returnedLines.Count -gt 0) {
            # Check if all returned lines are in the expected set
            $allValid = $true
            foreach ($line in $returnedLines) {
                if ($test.ExpectedLines -notcontains $line) {
                    $allValid = $false
                    break
                }
            }
            # Also check if at least one expected line is returned
            $hasExpected = $false
            foreach ($expectedLine in $test.ExpectedLines) {
                if ($returnedLines -contains $expectedLine) {
                    $hasExpected = $true
                    break
                }
            }
            $isValid = $allValid -and $hasExpected
        }
        
        if ($isValid) {
            Write-Host "PASS: $($test.Origin) to $($test.Destination)" -ForegroundColor Green
            Write-Host "  Returned: $returnedLinesStr" -ForegroundColor Gray
            $passed++
            $testResults += [PSCustomObject]@{
                Origin = $test.Origin
                Destination = $test.Destination
                Expected = $expectedLinesStr
                Returned = $returnedLinesStr
                Status = "PASS"
            }
        } else {
            Write-Host "FAIL: $($test.Origin) to $($test.Destination)" -ForegroundColor Red
            Write-Host "  Expected: $expectedLinesStr" -ForegroundColor Yellow
            Write-Host "  Returned: $returnedLinesStr" -ForegroundColor Red
            $failed++
            $testResults += [PSCustomObject]@{
                Origin = $test.Origin
                Destination = $test.Destination
                Expected = $expectedLinesStr
                Returned = $returnedLinesStr
                Status = "FAIL"
            }
        }
    } catch {
        Write-Host "ERROR: $($test.Origin) to $($test.Destination)" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        $failed++
        $testResults += [PSCustomObject]@{
            Origin = $test.Origin
            Destination = $test.Destination
            Expected = $expectedLinesStr
            Returned = "ERROR: $($_.Exception.Message)"
            Status = "ERROR"
        }
    }
    
    Start-Sleep -Milliseconds 100
}

Write-Host "`n=== TEST SUMMARY ===" -ForegroundColor Cyan
Write-Host "Total Tests: $($testCases.Count)" -ForegroundColor White
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })
Write-Host "Success Rate: $([math]::Round($passed / $testCases.Count * 100, 2))%`n" -ForegroundColor Cyan

# Show failed tests if any
if ($failed -gt 0) {
    Write-Host "`n=== FAILED TESTS ===" -ForegroundColor Red
    $testResults | Where-Object { $_.Status -ne "PASS" } | Format-Table -AutoSize
}

# Export results to CSV
$testResults | Export-Csv -Path "test-results.csv" -NoTypeInformation
Write-Host "Full results exported to test-results.csv" -ForegroundColor Cyan
