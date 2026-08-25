# One-time release signing bootstrap for DSH-Mobile.
# Creates a keystore and keystore.properties (both git-ignored), then the
# gradle release build signs with it. For real distribution keep the
# keystore + passwords safe (backup or CI secrets).
#
# Usage:
#   powershell -File scripts/init-release-signing.ps1
#   cd app/android; gradlew.bat :app:assembleRelease

$ErrorActionPreference = 'Stop'

$androidDir = "D:\2026AppDev\DSH-Mobile\app\android"
$propsPath  = Join-Path $androidDir "keystore.properties"
$keytool    = "$env:USERPROFILE\.jdks\corretto-17.0.9\bin\keytool.exe"

if (-not (Test-Path $keytool)) {
    Write-Host "keytool not found at $keytool — install a JDK 17+ first"
    exit 1
}

if (Test-Path $propsPath) {
    Write-Host "keystore.properties already exists — delete it to regenerate"
    exit 0
}

$storeFile = Read-Host "Keystore file name (default: dsh-mobile-release.keystore)"
if ([string]::IsNullOrWhiteSpace($storeFile)) { $storeFile = "dsh-mobile-release.keystore" }
$storePath = Join-Path $androidDir $storeFile

$alias = Read-Host "Key alias (default: dshmobile)"
if ([string]::IsNullOrWhiteSpace($alias)) { $alias = "dshmobile" }

# Generate a random strong password
$pass = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })

Write-Host ""
Write-Host "Creating keystore: $storePath (alias $alias)"
& $keytool -genkeypair -v `
    -keystore $storePath `
    -alias $alias `
    -keyalg RSA -keysize 2048 -validity 10000 `
    -storepass $pass `
    -keypass $pass `
    -dname "CN=DSH Mobile, OU=Mobile, O=DSH-Mobile, L=Local, C=CN" 2>&1 | Out-Null

@"
storeFile=$storeFile
storePassword=$pass
keyAlias=$alias
keyPassword=$pass
"@ | Set-Content -Path $propsPath -Encoding Ascii

Write-Host "keystore.properties written (git-ignored)."
Write-Host ""
Write-Host "KEEP THESE SAFE — they sign your release APK:"
Write-Host "  store:  $storePath"
Write-Host "  alias:  $alias"
Write-Host "  pass:   $pass"
Write-Host ""
Write-Host "Build release:"
Write-Host "  cd $androidDir"
Write-Host "  gradlew.bat :app:assembleRelease"
Write-Host "  # output: app\build\outputs\apk\release\app-release.apk"