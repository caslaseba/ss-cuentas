@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

set "PORT=3000"
set "PUBLIC=https://ss-cuentas.vercel.app"
set "REPO=caslaseba/ss-cuentas"
set "DEST=%USERPROFILE%\Desktop\ss-cuentas"

if exist "%~dp0package.json" if exist "%~dp0app" set "DEST=%~dp0"
if not exist "%DEST%\package.json" if exist "%USERPROFILE%\Desktop\SS_Cuentas\ss-cuentas\package.json" set "DEST=%USERPROFILE%\Desktop\SS_Cuentas\ss-cuentas"

echo.
echo  SS Cuentas
echo  ----------
echo.

set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%ProgramFiles%\GitHub CLI;%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"

call :require node "Node.js" "OpenJS.NodeJS.LTS" || exit /b 1
call :require git "Git" "Git.Git" || exit /b 1
call :require gh "GitHub CLI" "GitHub.cli" || exit /b 1

if not exist "%DEST%\package.json" (
  echo  Bajando el proyecto a:
  echo  %DEST%
  echo.
  gh auth status >nul 2>&1
  if errorlevel 1 (
    echo  Inicia sesion en GitHub con la cuenta caslaseba.
    gh auth login -h github.com -p https -w
    if errorlevel 1 (
      echo  No se pudo entrar a GitHub.
      pause
      exit /b 1
    )
  )
  gh repo clone %REPO% "%DEST%"
  if errorlevel 1 (
    echo  No se pudo clonar el repositorio.
    pause
    exit /b 1
  )
)

cd /d "%DEST%"
if errorlevel 1 (
  echo  No encuentro la carpeta %DEST%
  pause
  exit /b 1
)

if exist "%DEST%\.git" (
  echo  Actualizando el codigo desde GitHub...
  git pull --ff-only origin master
  if errorlevel 1 (
    echo  No pude actualizar. Si editaste archivos en esta carpeta, guardalos y volve a abrir.
    pause
    exit /b 1
  )
) else (
  echo  Esta carpeta no es el repo de GitHub. El codigo puede quedar viejo.
  echo  Borra %DEST% y volve a abrir este archivo para bajarlo de nuevo.
  echo.
)

echo  Instalando dependencias...
call npm install
if errorlevel 1 (
  echo  No se pudieron instalar las dependencias.
  pause
  exit /b 1
)

if not exist ".env.local" (
  echo.
  echo  Faltan las claves de Supabase. Inicia sesion en Vercel.
  call npx --yes vercel login
  call npx --yes vercel link --project ss-cuentas --scope gallo-system --yes
  call npx --yes vercel env pull .env.local --yes --scope gallo-system
)

if not exist ".env.local" (
  echo  Sin .env.local la app de esta PC no ve las cuentas.
  pause
  exit /b 1
)

findstr /B /C:"SUPABASE_SERVICE_ROLE_KEY=" ".env.local" >nul
if errorlevel 1 (
  echo.
  echo  El gestor de usuarios necesita el .env.local de la PC original.
  echo  Copialo a esta carpeta. No lo subas a GitHub.
  echo.
)

set "LAN="
powershell -NoProfile -Command "$x = Get-NetIPConfiguration | Where-Object IPv4DefaultGateway | Select-Object -First 1; $x.IPv4Address.IPAddress | Select-Object -First 1 | Set-Content $env:TEMP\ss-cuentas-ip.txt"
if exist "%TEMP%\ss-cuentas-ip.txt" set /p LAN=<"%TEMP%\ss-cuentas-ip.txt"

netsh advfirewall firewall show rule name="SS Cuentas 3000" >nul 2>&1
if errorlevel 1 netsh advfirewall firewall add rule name="SS Cuentas 3000" dir=in action=allow protocol=TCP localport=%PORT% >nul 2>&1

(
  echo SS Cuentas
  echo.
  echo Celular, con 4G o con Wi-Fi. No hace falta ninguna PC prendida:
  echo %PUBLIC%
  echo En Chrome o Edge: Instalar SS Cuentas. Queda un icono, como un programa.
  echo.
  echo Otra computadora en la misma red. Esta PC tiene que estar prendida y SS Cuentas abierto:
  if defined LAN (
    echo http://%LAN%:%PORT%
  ) else (
    echo No se detecto la IP de la red.
  )
  echo.
  echo Esta PC:
  echo http://localhost:%PORT%
  echo.
  echo Carpeta para abrir en Cursor:
  echo %DEST%
) > "%DEST%\COMO-ENTRAR.txt"

echo.
echo  Listo.
echo.
echo  Celular con 4G o Wi-Fi. Ninguna PC hace falta:
echo  %PUBLIC%
echo  En el navegador: Instalar SS Cuentas.
echo.
if defined LAN (
  echo  Otra PC en la misma red, con esta prendida:
  echo  http://%LAN%:%PORT%
  echo.
)
echo  Esta PC:
echo  http://localhost:%PORT%
echo.
echo  Cursor: Archivo, Abrir carpeta
echo  %DEST%
echo.
echo  No cierres esta ventana si vas a entrar desde otra PC de la red.
echo.

netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo  SS Cuentas ya estaba abierto.
  start "" "http://localhost:%PORT%"
  start "" notepad "%DEST%\COMO-ENTRAR.txt"
  pause
  exit /b 0
)

start "" "http://localhost:%PORT%"
start "" notepad "%DEST%\COMO-ENTRAR.txt"
call npm run dev
exit /b 0

:require
where %~1 >nul 2>&1
if not errorlevel 1 exit /b 0
echo  Instalando %~2...
where winget >nul 2>&1
if errorlevel 1 (
  echo  Instala %~2 y volve a abrir este archivo.
  pause
  exit /b 1
)
winget install --id %~3 -e --disable-interactivity --accept-package-agreements --accept-source-agreements
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%ProgramFiles%\GitHub CLI;%PATH%"
where %~1 >nul 2>&1
if errorlevel 1 (
  echo  %~2 quedo instalado. Cerra esta ventana y abri el archivo de nuevo.
  pause
  exit /b 1
)
exit /b 0
