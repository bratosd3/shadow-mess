@echo off
chcp 65001 > nul
title Shadow Mess — Push to GitHub
cd /d "%~dp0"

echo.
echo  ════════════════════════════════════════════
echo   Shadow Mess — Загрузка на GitHub
echo  ════════════════════════════════════════════
echo.

set /p GITHUB_USER=  Введи свой логин GitHub: 
set /p GITHUB_EMAIL=  Введи свой email GitHub: 

echo.
echo  Настраиваю репозиторий...

git config user.name "%GITHUB_USER%"
git config user.email "%GITHUB_EMAIL%"

git init
git add .
git commit -m "Shadow Mess v2.0"
git branch -M main
git remote remove origin 2>nul
git remote add origin https://github.com/%GITHUB_USER%/shadow-mess.git

echo.
echo  ════════════════════════════════════════════
echo   Сейчас откроется окно авторизации GitHub
echo   Войди в аккаунт и разреши доступ
echo  ════════════════════════════════════════════
echo.

git push -u origin main

if %errorlevel%==0 (
    echo.
    echo  ✅ Готово! Код загружен на GitHub!
    echo  https://github.com/%GITHUB_USER%/shadow-mess
    echo.
) else (
    echo.
    echo  ❌ Ошибка! Возможные причины:
    echo     1. Неправильный логин
    echo     2. Репозиторий не создан на сайте
    echo     3. Нет доступа к GitHub
    echo.
)

pause
