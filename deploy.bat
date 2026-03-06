@echo off
chcp 65001 >nul
title Shadow Mess — Auto Deploy (GitHub + Render)
cd /d "%~dp0"

echo.
echo  ╔════════════════════════════════════════════╗
echo  ║  Shadow Mess — Auto Deploy                 ║
echo  ║  GitHub → Render (автоматический деплой)   ║
echo  ╚════════════════════════════════════════════╝
echo.

:: ── Проверка git ──
where git >nul 2>nul
if errorlevel 1 (
    echo  ❌ Git не найден! Установите git: https://git-scm.com
    pause
    exit /b 1
)

:: ── Проверка инициализации ──
if not exist ".git\" (
    echo  📦 Инициализация git репозитория...
    git init
    git branch -M main
)

:: ── Проверка remote ──
git remote get-url origin >nul 2>nul
if errorlevel 1 (
    echo  ⚠ Remote origin не настроен.
    echo.
    set /p GITHUB_USER=  Ваш логин GitHub: 
    set /p REPO_NAME=  Имя репозитория [shadow-mess]: 
    if "%REPO_NAME%"=="" set REPO_NAME=shadow-mess
    git remote add origin https://github.com/%GITHUB_USER%/%REPO_NAME%.git
    echo  ✅ Remote добавлен
    echo.
)

:: ── Получаем URL remote ──
for /f "delims=" %%a in ('git remote get-url origin 2^>nul') do set REMOTE_URL=%%a
echo  📡 Remote: %REMOTE_URL%
echo.

:: ── Запрос на коммит-сообщение ──
set /p COMMIT_MSG=  Сообщение коммита [update]: 
if "%COMMIT_MSG%"=="" set COMMIT_MSG=update

:: ── Добавляем файлы ──
echo.
echo  📝 Добавляю файлы...
git add -A

:: ── Проверка есть ли изменения ──
git diff --cached --quiet 2>nul
if %errorlevel%==0 (
    echo  ℹ Нет изменений для коммита.
    echo  Делаю push последних коммитов...
    goto :push
)

:: ── Коммит ──
echo  💾 Коммит: %COMMIT_MSG%
git commit -m "%COMMIT_MSG%"

:push
:: ── Push ──
echo.
echo  🚀 Отправляю на GitHub...
git push -u origin main

if %errorlevel%==0 (
    echo.
    echo  ╔════════════════════════════════════════════╗
    echo  ║  ✅ Код загружен на GitHub!                ║
    echo  ║  Render начнёт деплой автоматически.       ║
    echo  ║                                            ║
    echo  ║  📋 Что дальше:                            ║
    echo  ║  1. Render подхватит изменения сам          ║
    echo  ║     (если подключён к GitHub)               ║
    echo  ║  2. Или GitHub Action вызовет deploy hook   ║
    echo  ║  3. Деплой занимает ~2-3 мин               ║
    echo  ╚════════════════════════════════════════════╝
    echo.
    echo  🔗 GitHub: %REMOTE_URL%
    echo.
) else (
    echo.
    echo  ❌ Ошибка push! Возможные причины:
    echo     1. Репозиторий не создан на GitHub
    echo     2. Нет прав на запись
    echo     3. Нужна авторизация (token/SSH)
    echo.
    echo  💡 Создайте репозиторий: https://github.com/new
    echo.
)

pause
