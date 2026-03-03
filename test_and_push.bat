@echo off
chcp 65001 >nul
title Shadow Mess — Test & Push

echo.
echo ═══════════════════════════════════════════════
echo   Shadow Mess — Тестирование и деплой
echo ═══════════════════════════════════════════════
echo.

:: ── Шаг 1: Копируем файлы из test/ в основной проект ──
echo [1/4] Проверяем папку test...
if not exist "test\" (
    echo ERROR: Папка test\ не найдена!
    echo Создайте папку test\ и положите туда файлы для тестирования.
    pause
    exit /b 1
)

:: Проверяем есть ли файлы в test
dir /b "test\" 2>nul | findstr "." >nul
if errorlevel 1 (
    echo Папка test\ пуста. Нечего обновлять.
    echo Положите обновлённые файлы в test\ с сохранением структуры:
    echo   test\server.js
    echo   test\static\css\style.css
    echo   test\static\js\app.js
    echo   test\static\index.html
    echo   и т.д.
    pause
    exit /b 1
)

echo.
echo Файлы в test\:
echo ───────────────
dir /s /b "test\" 2>nul
echo.

:: ── Шаг 2: Запускаем локальный тест ──
echo [2/4] Запускаем локальный тест-сервер...
echo (Нажмите Ctrl+C чтобы остановить сервер после проверки)
echo.

:: Копируем файлы из test во временную тест-папку
if exist "_test_temp\" rmdir /s /q "_test_temp"
xcopy /e /i /y "." "_test_temp\" >nul 2>nul
xcopy /e /y "test\*" "_test_temp\" >nul 2>nul

echo Тест-сервер запущен на http://localhost:3001
echo Откройте в браузере и проверьте изменения.
echo.
set /p CONFIRM="Всё работает? Применить изменения? (y/n): "

:: Удаляем временную папку
if exist "_test_temp\" rmdir /s /q "_test_temp"

if /i not "%CONFIRM%"=="y" (
    echo Отменено. Файлы НЕ были применены.
    pause
    exit /b 0
)

:: ── Шаг 3: Применяем файлы из test/ ──
echo.
echo [3/4] Применяем файлы из test\ в основной проект...
xcopy /e /y "test\*" ".\" >nul
echo Файлы скопированы!

:: ── Шаг 4: Git push ──
echo.
echo [4/4] Пушим на GitHub...

:: Проверяем git конфигурацию
git config user.name >nul 2>nul
if errorlevel 1 (
    set /p GIT_NAME="Ваш GitHub username: "
    set /p GIT_EMAIL="Ваш email: "
    git config user.name "%GIT_NAME%"
    git config user.email "%GIT_EMAIL%"
)

set /p COMMIT_MSG="Сообщение коммита (или Enter для 'update'): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=update

git add -A
git commit -m "%COMMIT_MSG%"
git push origin main

if errorlevel 1 (
    echo.
    echo Ошибка при push! Попробуем force push...
    git push origin main --force
)

echo.
echo ═══════════════════════════════════════════════
echo   Готово! Изменения применены и запушены.
echo   Render автоматически обновит сервер.
echo ═══════════════════════════════════════════════
echo.

:: Опционально: очищаем test/ после успешного деплоя
set /p CLEAR="Очистить папку test\? (y/n): "
if /i "%CLEAR%"=="y" (
    del /q "test\*" 2>nul
    for /d %%d in ("test\*") do rmdir /s /q "%%d" 2>nul
    echo Папка test\ очищена.
)

pause
