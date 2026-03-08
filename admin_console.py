#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Shadow Messenger — Console Admin Panel v4.8
import os
import sys
import subprocess

def ensure_package(name, pip_name=None):
    try:
        __import__(name)
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name or name])

ensure_package("requests")
ensure_package("rich")

import requests
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from rich.columns import Columns
from rich import box

console = Console()

DEFAULT_URL = "https://shadow-mess.onrender.com"
DEFAULT_KEY = "shadow_admin_secret_2026"

server_url = os.environ.get("SHADOW_SERVER", DEFAULT_URL)
admin_key = os.environ.get("SHADOW_ADMIN_KEY", DEFAULT_KEY)


def headers():
    return {"X-Admin-Key": admin_key, "Content-Type": "application/json"}


def api_get(path):
    try:
        r = requests.get(f"{server_url}{path}", headers=headers(), timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {"_error": str(e)}


def api_delete(path):
    try:
        r = requests.delete(f"{server_url}{path}", headers=headers(), timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {"_error": str(e)}


def api_put(path, data=None):
    try:
        r = requests.put(f"{server_url}{path}", headers=headers(), json=data, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {"_error": str(e)}


def clear():
    os.system("cls" if os.name == "nt" else "clear")


def pause():
    console.print("\n[dim]Нажмите Enter для продолжения...[/dim]")
    input()


def show_header():
    console.print(Panel(
        Text("🌌 Shadow Messenger — Admin Console v4.8", style="bold bright_magenta", justify="center"),
        border_style="bright_magenta",
        padding=(0, 2)
    ))
    console.print(f"  [dim]Сервер:[/dim] [cyan]{server_url}[/cyan]\n")


def choose(options, title="Выберите действие"):
    """Display numbered menu and return selected index (0-based) or -1 for back."""
    console.print(f"\n[bold bright_white]{title}[/bold bright_white]\n")
    for i, (label, _icon) in enumerate(options, 1):
        console.print(f"  [bright_magenta][{i}][/bright_magenta]  {_icon}  {label}")
    console.print(f"  [dim][0]  ← Назад[/dim]")
    console.print()
    try:
        choice = input("  ▸ ").strip()
        if not choice or choice == "0":
            return -1
        idx = int(choice) - 1
        if 0 <= idx < len(options):
            return idx
        console.print("[red]  Неверный выбор[/red]")
        return -1
    except (ValueError, EOFError):
        return -1


# ════════════════════════════════════════════════════════════════════════
#  DASHBOARD
# ════════════════════════════════════════════════════════════════════════
def page_dashboard():
    clear()
    show_header()
    console.print("[bold]📊 Главная панель[/bold]\n")

    data = api_get("/api/admin/stats")
    if "_error" in data:
        console.print(f"[red]❌ Ошибка: {data['_error']}[/red]")
        pause()
        return

    table = Table(box=box.ROUNDED, border_style="bright_magenta", show_header=False, padding=(0, 2))
    table.add_column("Метрика", style="bold")
    table.add_column("Значение", style="bold bright_cyan", justify="right")

    table.add_row("👥 Пользователи", str(data.get("users", 0)))
    table.add_row("💬 Чаты", str(data.get("chats", 0)))
    table.add_row("✉️  Сообщения", str(data.get("messages", 0)))
    table.add_row("📡 Сессии", str(data.get("sessions", 0)))
    table.add_row("🔔 Push-подписки", str(data.get("pushSubs", 0)))
    console.print(table)
    console.print("[green]● Подключено[/green]")
    pause()


# ════════════════════════════════════════════════════════════════════════
#  USERS
# ════════════════════════════════════════════════════════════════════════
def page_users():
    while True:
        clear()
        show_header()
        console.print("[bold]👥 Пользователи[/bold]\n")

        users = api_get("/api/admin/users")
        if isinstance(users, dict) and "_error" in users:
            console.print(f"[red]❌ {users['_error']}[/red]")
            pause()
            return

        if not users:
            console.print("[dim]Нет пользователей[/dim]")
            pause()
            return

        table = Table(box=box.ROUNDED, border_style="bright_magenta")
        table.add_column("#", style="dim", width=4)
        table.add_column("Имя", style="bold bright_white")
        table.add_column("@username", style="cyan")
        table.add_column("Роль", style="bold")
        table.add_column("Био", style="dim", max_width=20, overflow="ellipsis")
        table.add_column("Дата", style="dim")

        for i, u in enumerate(users, 1):
            name = u.get("displayName") or "—"
            uname = "@" + (u.get("username") or "")
            if u.get("superUser"):
                role = "[bright_yellow]⚡ Super[/bright_yellow]"
            elif u.get("premium"):
                role = "[bright_magenta]⭐ Premium[/bright_magenta]"
            else:
                role = "[dim]—[/dim]"
            bio = (u.get("bio") or "—")[:20]
            created = (u.get("createdAt") or "")[:10]
            table.add_row(str(i), name, uname, role, bio, created)

        console.print(table)
        console.print(f"  [dim]Всего: {len(users)}[/dim]\n")

        options = [
            ("Переключить SuperUser", "👑"),
            ("Переключить Premium", "⭐"),
            ("Управление Premium-функциями", "🎛️"),
            ("Удалить пользователя", "❌"),
            ("Поиск пользователя", "🔍"),
        ]
        idx = choose(options, "Действия с пользователями")

        if idx == -1:
            return
        elif idx == 0:
            _user_toggle_su(users)
        elif idx == 1:
            _user_toggle_premium(users)
        elif idx == 2:
            _user_features(users)
        elif idx == 3:
            _user_delete(users)
        elif idx == 4:
            _user_search(users)


def _pick_user(users, prompt="Введите номер пользователя"):
    try:
        n = int(input(f"  {prompt} (1-{len(users)}): ").strip())
        if 1 <= n <= len(users):
            return users[n - 1]
    except (ValueError, EOFError):
        pass
    console.print("[red]  Неверный номер[/red]")
    return None


def _user_toggle_su(users):
    u = _pick_user(users)
    if not u:
        return
    r = api_put(f"/api/admin/users/{u['_id']}/superuser")
    if "_error" not in r:
        st = "ВКЛ" if r.get("superUser") else "ВЫКЛ"
        console.print(f"[green]  ✓ {r.get('username', '?')} → SuperUser {st}[/green]")
    else:
        console.print(f"[red]  ✗ {r['_error']}[/red]")
    pause()


def _user_toggle_premium(users):
    u = _pick_user(users)
    if not u:
        return
    r = api_put(f"/api/admin/users/{u['_id']}/premium")
    if "_error" not in r:
        st = "ВКЛ" if r.get("premium") else "ВЫКЛ"
        console.print(f"[green]  ✓ {r.get('username', '?')} → Premium {st}[/green]")
    else:
        console.print(f"[red]  ✗ {r['_error']}[/red]")
    pause()


def _user_features(users):
    u = _pick_user(users)
    if not u:
        return

    console.print(f"\n[bold]  🎛️ Premium-функции для @{u.get('username', '?')}[/bold]\n")

    features = [
        ("premiumEmoji",      "😎 Эмодзи профиля"),
        ("premiumBadge",      "🎖 Значок"),
        ("premiumNameColor",  "🎨 Цвет имени"),
        ("customStatus",      "💬 Статус"),
        ("customStatusEmoji", "🎭 Эмодзи статуса"),
        ("customStatusColor", "🌈 Цвет статуса"),
    ]

    data = {}
    for field, label in features:
        current = u.get(field, "") or ""
        val = input(f"  {label} [{current}]: ").strip()
        data[field] = val if val else current

    r = api_put(f"/api/admin/users/{u['_id']}/premium-features", data)
    if "_error" not in r:
        console.print(f"[green]  ✓ Функции обновлены для @{u.get('username', '?')}[/green]")
    else:
        console.print(f"[red]  ✗ {r['_error']}[/red]")
    pause()


def _user_delete(users):
    u = _pick_user(users)
    if not u:
        return
    name = u.get("displayName") or u.get("username", "?")
    confirm = input(f"  Удалить {name}? (да/нет): ").strip().lower()
    if confirm in ("да", "yes", "y"):
        r = api_delete(f"/api/admin/users/{u['_id']}")
        if "_error" not in r:
            console.print(f"[green]  ✓ Пользователь {name} удалён[/green]")
        else:
            console.print(f"[red]  ✗ {r['_error']}[/red]")
    else:
        console.print("[dim]  Отменено[/dim]")
    pause()


def _user_search(users):
    q = input("  Поиск: ").strip().lower()
    if not q:
        return
    found = [u for u in users if q in (u.get("displayName") or "").lower() or q in (u.get("username") or "").lower()]
    if not found:
        console.print("[dim]  Не найдено[/dim]")
    else:
        for u in found:
            role = "⚡Super" if u.get("superUser") else ("⭐Prem" if u.get("premium") else "")
            console.print(f"  [cyan]@{u.get('username', '?')}[/cyan]  {u.get('displayName', '—')}  [yellow]{role}[/yellow]")
    pause()


# ════════════════════════════════════════════════════════════════════════
#  PREMIUM
# ════════════════════════════════════════════════════════════════════════
def page_premium():
    while True:
        clear()
        show_header()
        console.print("[bold]⭐ Premium управление[/bold]\n")

        cfg = api_get("/api/admin/config/premium")
        if isinstance(cfg, dict) and "_error" not in cfg:
            enabled = cfg.get("premiumEnabled", True)
            if enabled:
                console.print(Panel("[bold bright_yellow]⭐ Premium ВКЛЮЧЁН[/bold bright_yellow]\nФункции доступны только подписчикам", border_style="yellow"))
            else:
                console.print(Panel("[bold green]☆ Premium ОТКЛЮЧЁН[/bold green]\nВсе функции бесплатны для всех", border_style="green"))
        else:
            console.print("[dim]Не удалось загрузить статус[/dim]")

        # Show premium users
        users = api_get("/api/admin/users")
        if isinstance(users, list):
            special = [u for u in users if u.get("superUser") or u.get("premium")]
            if special:
                console.print("\n[bold]Пользователи с особыми ролями:[/bold]")
                for u in special:
                    role = "[bright_yellow]⚡ Super[/bright_yellow]" if u.get("superUser") else "[bright_magenta]⭐ Premium[/bright_magenta]"
                    console.print(f"  {role}  {u.get('displayName', '?')}  [dim]@{u.get('username', '')}[/dim]")
            else:
                console.print("\n[dim]Нет пользователей с особыми ролями[/dim]")

        options = [
            ("Включить Premium (платно)", "⭐"),
            ("Отключить Premium (бесплатно)", "☆"),
            ("Управление функциями", "🎛️"),
        ]
        idx = choose(options)
        if idx == -1:
            return
        elif idx == 0:
            r = api_put("/api/admin/config/premium", {"enabled": True})
            if "_error" not in r:
                console.print("[green]  ✓ Premium ВКЛЮЧЁН[/green]")
            else:
                console.print(f"[red]  ✗ {r['_error']}[/red]")
            pause()
        elif idx == 1:
            r = api_put("/api/admin/config/premium", {"enabled": False})
            if "_error" not in r:
                console.print("[green]  ✓ Premium ОТКЛЮЧЁН — всё бесплатно[/green]")
            else:
                console.print(f"[red]  ✗ {r['_error']}[/red]")
            pause()
        elif idx == 2:
            page_features()


# ════════════════════════════════════════════════════════════════════════
#  FEATURES CONFIG
# ════════════════════════════════════════════════════════════════════════
def page_features():
    clear()
    show_header()
    console.print("[bold]🎛️ Настройка доступных функций[/bold]\n")

    data = api_get("/api/admin/features")
    if isinstance(data, dict) and "_error" in data:
        console.print(f"[red]❌ {data['_error']}[/red]")
        pause()
        return

    premium_features = data.get("premium", {})
    super_features = data.get("super", {})

    prem_labels = {
        "ghost": "Призрак (невидимка)",
        "emoji": "Эмодзи профиля",
        "badge": "Значок профиля",
        "nameColor": "Цвет имени",
        "exclusiveThemes": "Эксклюзивные темы",
        "customStatus": "Кастомный статус",
        "notifSounds": "Звуки уведомлений",
        "socialLinks": "Соц. ссылки",
        "banner": "Баннер профиля",
        "translate": "Перевод сообщений",
        "customTheme": "Свой конструктор тем",
        "disappearing": "Исчезающие сообщения",
        "fonts": "Кастомные шрифты",
        "bigUpload": "Большие файлы",
    }

    super_labels = {
        "broadcast": "Рассылка всем",
        "announce": "Объявления",
        "moderate": "Модерация",
        "seeHidden": "Видеть скрытых",
        "animation": "Анимация входа",
        "priority": "Приоритет",
        "noLimits": "Без ограничений",
    }

    console.print("[bold bright_magenta]Premium функции:[/bold bright_magenta]")
    table_p = Table(box=box.SIMPLE, show_header=True, border_style="magenta")
    table_p.add_column("#", style="dim", width=4)
    table_p.add_column("Функция", style="bright_white")
    table_p.add_column("Статус", justify="center")

    prem_keys = list(prem_labels.keys())
    for i, key in enumerate(prem_keys, 1):
        enabled = premium_features.get(key, True)
        status = "[green]✓ ВКЛ[/green]" if enabled else "[red]✗ ВЫКЛ[/red]"
        table_p.add_row(str(i), prem_labels[key], status)
    console.print(table_p)

    console.print("\n[bold bright_yellow]Super User функции:[/bold bright_yellow]")
    table_s = Table(box=box.SIMPLE, show_header=True, border_style="yellow")
    table_s.add_column("#", style="dim", width=4)
    table_s.add_column("Функция", style="bright_white")
    table_s.add_column("Статус", justify="center")

    super_keys = list(super_labels.keys())
    offset = len(prem_keys)
    for i, key in enumerate(super_keys, 1):
        enabled = super_features.get(key, True)
        status = "[green]✓ ВКЛ[/green]" if enabled else "[red]✗ ВЫКЛ[/red]"
        table_s.add_row(str(offset + i), super_labels[key], status)
    console.print(table_s)

    console.print("\n[dim]Введите номер функции для переключения (0 — назад, 'all' — вкл все, 'none' — выкл все):[/dim]")
    choice = input("  ▸ ").strip().lower()

    if choice == "0" or not choice:
        return
    elif choice == "all":
        for k in prem_keys:
            premium_features[k] = True
        for k in super_keys:
            super_features[k] = True
    elif choice == "none":
        for k in prem_keys:
            premium_features[k] = False
        for k in super_keys:
            super_features[k] = False
    else:
        try:
            num = int(choice)
            if 1 <= num <= len(prem_keys):
                key = prem_keys[num - 1]
                premium_features[key] = not premium_features.get(key, True)
            elif offset < num <= offset + len(super_keys):
                key = super_keys[num - offset - 1]
                super_features[key] = not super_features.get(key, True)
            else:
                console.print("[red]  Неверный номер[/red]")
                pause()
                return
        except ValueError:
            console.print("[red]  Неверный ввод[/red]")
            pause()
            return

    r = api_put("/api/admin/features", {"premium": premium_features, "super": super_features})
    if "_error" not in r:
        console.print("[green]  ✓ Настройки функций сохранены[/green]")
    else:
        console.print(f"[red]  ✗ {r['_error']}[/red]")
    pause()


# ════════════════════════════════════════════════════════════════════════
#  TOOLS
# ════════════════════════════════════════════════════════════════════════
def page_tools():
    while True:
        clear()
        show_header()
        console.print("[bold]🔧 Инструменты[/bold]\n")

        options = [
            ("Удалить все сообщения", "✉️"),
            ("Удалить все чаты", "💬"),
            ("Очистить сессии", "📡"),
            ("Очистить push-подписки", "🔔"),
            ("⚠️ ПОЛНЫЙ СБРОС", "💥"),
        ]
        idx = choose(options)
        if idx == -1:
            return
        elif idx == 0:
            _tool_delete("/api/admin/messages", "все сообщения", "deleted")
        elif idx == 1:
            _tool_delete("/api/admin/chats", "все чаты и сообщения", "deletedChats")
        elif idx == 2:
            _tool_delete("/api/admin/sessions", "неактивные сессии", "deleted")
        elif idx == 3:
            _tool_delete("/api/admin/pushsubs", "push-подписки", "deleted")
        elif idx == 4:
            _tool_reset()


def _tool_delete(endpoint, desc, count_key):
    confirm = input(f"  Удалить {desc}? (да/нет): ").strip().lower()
    if confirm not in ("да", "yes", "y"):
        console.print("[dim]  Отменено[/dim]")
        pause()
        return
    r = api_delete(endpoint)
    if "_error" not in r:
        console.print(f"[green]  ✓ Удалено: {r.get(count_key, 0)}[/green]")
    else:
        console.print(f"[red]  ✗ {r['_error']}[/red]")
    pause()


def _tool_reset():
    console.print("[bold red]\n  ⚠️ ПОЛНЫЙ СБРОС БАЗЫ ДАННЫХ![/bold red]")
    console.print("[yellow]  Будут удалены ВСЕ данные: пользователи, чаты, сообщения, сессии.[/yellow]")
    confirm = input("  Введите RESET для подтверждения: ").strip()
    if confirm != "RESET":
        console.print("[dim]  Отменено[/dim]")
        pause()
        return
    r = api_delete("/api/admin/reset")
    if "_error" not in r:
        total = sum(v for k, v in r.items() if k.startswith("deleted") and isinstance(v, int))
        console.print(f"[green]  ✓ БД очищена! Удалено: {total}[/green]")
    else:
        console.print(f"[red]  ✗ {r['_error']}[/red]")
    pause()


# ════════════════════════════════════════════════════════════════════════
#  SETTINGS
# ════════════════════════════════════════════════════════════════════════
def page_settings():
    global server_url, admin_key
    clear()
    show_header()
    console.print("[bold]⚙️ Настройки[/bold]\n")

    console.print(f"  Текущий сервер: [cyan]{server_url}[/cyan]")
    console.print(f"  Текущий ключ:   [dim]{'•' * min(len(admin_key), 20)}[/dim]\n")

    new_url = input(f"  Новый URL [{server_url}]: ").strip()
    if new_url:
        server_url = new_url.rstrip("/")

    new_key = input(f"  Новый admin key [скрыт]: ").strip()
    if new_key:
        admin_key = new_key

    console.print(f"\n  [green]✓ Сохранено[/green]  Сервер: [cyan]{server_url}[/cyan]")

    test = input("  Проверить подключение? (да/нет): ").strip().lower()
    if test in ("да", "yes", "y"):
        r = api_get("/api/admin/stats")
        if "_error" not in r:
            console.print(f"[green]  ● Подключено! Пользователей: {r.get('users', 0)}[/green]")
        else:
            console.print(f"[red]  ● Ошибка: {r['_error']}[/red]")
    pause()


# ════════════════════════════════════════════════════════════════════════
#  MAIN MENU
# ════════════════════════════════════════════════════════════════════════
def main():
    while True:
        clear()
        show_header()

        options = [
            ("Главная панель (статистика)", "📊"),
            ("Пользователи", "👥"),
            ("Premium управление", "⭐"),
            ("Инструменты (очистка)", "🔧"),
            ("Настройки", "⚙️"),
        ]

        console.print("[bold bright_white]Главное меню[/bold bright_white]\n")
        for i, (label, icon) in enumerate(options, 1):
            console.print(f"  [bright_magenta][{i}][/bright_magenta]  {icon}  {label}")
        console.print(f"  [dim][0]  Выход[/dim]")
        console.print()

        try:
            choice = input("  ▸ ").strip()
        except (EOFError, KeyboardInterrupt):
            break

        if choice == "0" or not choice:
            console.print("\n[dim]До свидания! 👋[/dim]")
            break
        elif choice == "1":
            page_dashboard()
        elif choice == "2":
            page_users()
        elif choice == "3":
            page_premium()
        elif choice == "4":
            page_tools()
        elif choice == "5":
            page_settings()
        else:
            console.print("[red]  Неверный выбор[/red]")
            pause()


if __name__ == "__main__":
    main()
