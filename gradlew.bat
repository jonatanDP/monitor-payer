@echo off
setlocal
set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
set "ANDROID_USER_HOME=%PROJECT_DIR%\.android"
set "GRADLE_USER_HOME=%PROJECT_DIR%\.gradle-user"
set "GRADLE_RO_DEP_CACHE=%USERPROFILE%\.gradle\caches"
if defined GRADLE_OPTS (
  set "GRADLE_OPTS=%GRADLE_OPTS% -Dorg.gradle.native=false -Dorg.gradle.console=plain"
) else (
  set "GRADLE_OPTS=-Dorg.gradle.native=false -Dorg.gradle.console=plain"
)
if not exist "%ANDROID_USER_HOME%" mkdir "%ANDROID_USER_HOME%"
if not exist "%GRADLE_USER_HOME%" mkdir "%GRADLE_USER_HOME%"
set "GRADLE_BIN="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "(Get-ChildItem -Path \"$env:USERPROFILE\\.gradle\\wrapper\\dists\" -Recurse -Filter gradle.bat | Select-Object -Last 1 -ExpandProperty FullName)"`) do (
  set "GRADLE_BIN=%%I"
)
if not exist "%GRADLE_BIN%" (
  echo Gradle binary not found: %GRADLE_BIN%
  exit /b 1
)
call "%GRADLE_BIN%" %*
exit /b %ERRORLEVEL%
