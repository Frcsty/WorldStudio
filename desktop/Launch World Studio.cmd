@echo off
setlocal
if not defined WORLD_STUDIO_WORKSPACE if exist "%~dp0workspace\setups\setup.schema.json" set "WORLD_STUDIO_WORKSPACE=%~dp0workspace"
start "" /D "%~dp0" "%~dp0World Studio.exe" %*
endlocal
