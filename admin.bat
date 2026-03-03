@echo off
chcp 65001 >nul
title Shadow Mess — Админ-панель (CLI)

echo.
echo ══════════════════════════════════════════════════
echo   Shadow Mess — Управление базой данных
echo ══════════════════════════════════════════════════
echo.

:: URL сервера (по умолчанию Render)
set SERVER=https://shadow-mess.onrender.com
set /p SERVER_INPUT="URL сервера [%SERVER%]: "
if not "%SERVER_INPUT%"=="" set SERVER=%SERVER_INPUT%

echo.
echo Сервер: %SERVER%
echo.

:: Авторизация
set /p USERNAME="Логин админа: "
set /p PASSWORD="Пароль: "

echo.
echo Авторизация...

:: Получаем токен через PowerShell
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "$r = Invoke-RestMethod -Uri '%SERVER%/api/login' -Method Post -ContentType 'application/json' -Body ('{\"username\":\"%USERNAME%\",\"password\":\"%PASSWORD%\"}'); $r.token"`) do set TOKEN=%%T

if "%TOKEN%"=="" (
    echo.
    echo ОШИБКА: Не удалось авторизоваться. Проверьте логин и пароль.
    pause
    exit /b 1
)

echo Авторизация успешна!
echo.

:MENU
echo ══════════════════════════════════════════════════
echo   Выберите действие:
echo ══════════════════════════════════════════════════
echo.
echo   1. Показать статистику
echo   2. Очистить все сообщения
echo   3. Удалить все чаты
echo   4. Удалить пользователей (кроме админов)
echo   5. Очистить сессии
echo   6. Очистить push-подписки
echo   7. ПОЛНЫЙ СБРОС (удалить ВСЁ)
echo   0. Выход
echo.
set /p CHOICE="Ваш выбор: "

if "%CHOICE%"=="1" goto STATS
if "%CHOICE%"=="2" goto DEL_MESSAGES
if "%CHOICE%"=="3" goto DEL_CHATS
if "%CHOICE%"=="4" goto DEL_USERS
if "%CHOICE%"=="5" goto DEL_SESSIONS
if "%CHOICE%"=="6" goto DEL_PUSH
if "%CHOICE%"=="7" goto FULL_RESET
if "%CHOICE%"=="0" goto EXIT
goto MENU

:STATS
echo.
echo Загрузка статистики...
powershell -NoProfile -Command "$h = @{Authorization='Bearer %TOKEN%'}; $r = Invoke-RestMethod -Uri '%SERVER%/api/admin/stats' -Headers $h; Write-Host '  Пользователей: ' $r.users; Write-Host '  Чатов:         ' $r.chats; Write-Host '  Сообщений:     ' $r.messages; Write-Host '  Сессий:        ' $r.sessions"
echo.
goto MENU

:DEL_MESSAGES
set /p CONFIRM="Удалить ВСЕ сообщения? (y/n): "
if /i not "%CONFIRM%"=="y" goto MENU
powershell -NoProfile -Command "$h = @{Authorization='Bearer %TOKEN%'}; $r = Invoke-RestMethod -Uri '%SERVER%/api/admin/messages' -Method Delete -Headers $h; Write-Host 'Удалено сообщений:' $r.deleted"
echo.
goto MENU

:DEL_CHATS
set /p CONFIRM="Удалить ВСЕ чаты и сообщения? (y/n): "
if /i not "%CONFIRM%"=="y" goto MENU
powershell -NoProfile -Command "$h = @{Authorization='Bearer %TOKEN%'}; $r = Invoke-RestMethod -Uri '%SERVER%/api/admin/chats' -Method Delete -Headers $h; Write-Host 'Удалено чатов:' $r.deletedChats 'сообщений:' $r.deletedMessages"
echo.
goto MENU

:DEL_USERS
set /p CONFIRM="Удалить всех пользователей кроме админов? (y/n): "
if /i not "%CONFIRM%"=="y" goto MENU
powershell -NoProfile -Command "$h = @{Authorization='Bearer %TOKEN%'}; $r = Invoke-RestMethod -Uri '%SERVER%/api/admin/users' -Method Delete -Headers $h; Write-Host 'Удалено:' $r.deleted"
echo.
goto MENU

:DEL_SESSIONS
set /p CONFIRM="Очистить сессии? (y/n): "
if /i not "%CONFIRM%"=="y" goto MENU
powershell -NoProfile -Command "$h = @{Authorization='Bearer %TOKEN%'}; $r = Invoke-RestMethod -Uri '%SERVER%/api/admin/sessions' -Method Delete -Headers $h; Write-Host 'Удалено:' $r.deleted"
echo.
goto MENU

:DEL_PUSH
set /p CONFIRM="Очистить push-подписки? (y/n): "
if /i not "%CONFIRM%"=="y" goto MENU
powershell -NoProfile -Command "$h = @{Authorization='Bearer %TOKEN%'}; $r = Invoke-RestMethod -Uri '%SERVER%/api/admin/pushsubs' -Method Delete -Headers $h; Write-Host 'Удалено:' $r.deleted"
echo.
goto MENU

:FULL_RESET
echo.
echo  ⚠️  ВНИМАНИЕ! Это удалит АБСОЛЮТНО ВСЁ кроме вашего аккаунта!
set /p CONFIRM="Продолжить? (yes/no): "
if /i not "%CONFIRM%"=="yes" goto MENU
set /p CONFIRM2="Точно уверены? Введите RESET для подтверждения: "
if not "%CONFIRM2%"=="RESET" goto MENU
powershell -NoProfile -Command "$h = @{Authorization='Bearer %TOKEN%'}; $r = Invoke-RestMethod -Uri '%SERVER%/api/admin/reset' -Method Delete -Headers $h; Write-Host 'Удалено: сообщений' $r.deletedMessages ', чатов' $r.deletedChats ', пользователей' $r.deletedUsers"
echo.
goto MENU

:EXIT
echo.
echo До свидания!
timeout /t 2 >nul
exit /b 0
