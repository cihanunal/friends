@echo off
setlocal
set "APP_DIR=%~dp0"
set "NODE=C:\Users\Devran\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
cd /d "%APP_DIR%"
"%NODE%" "%APP_DIR%server.js"
