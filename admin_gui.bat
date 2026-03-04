@echo off
chcp 65001 >nul 2>&1
title Shadow Mess — Admin Panel GUI
python "%~dp0admin_gui.py"
if errorlevel 1 (
    echo.
    echo [!] Ошибка запуска. Убедитесь что Python установлен.
    pause
)
