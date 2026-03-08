#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Shadow Messenger — Interactive Admin Console v4.9
TUI с кликабельными кнопками, переключателями и таблицами.
Запуск: python admin_console.py
"""

import os
import sys
import subprocess


def ensure(name, pip_name=None):
    try:
        __import__(name)
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name or name])


ensure("requests")
ensure("textual")

import requests
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.widgets import (
    Header, Footer, Button, Static, DataTable,
    Switch, Input, Label, Rule, ContentSwitcher,
)
from textual import on


# ═══════════════════════════════════════════════════════════════
#  CONFIG & API
# ═══════════════════════════════════════════════════════════════

class Config:
    url = os.environ.get("SHADOW_SERVER", "https://shadow-mess.onrender.com")
    key = os.environ.get("SHADOW_ADMIN_KEY", "shadow_admin_secret_2026")


def _headers():
    return {"X-Admin-Key": Config.key, "Content-Type": "application/json"}


def api(method, path, data=None):
    try:
        fn = {"GET": requests.get, "PUT": requests.put,
              "POST": requests.post, "DELETE": requests.delete}[method]
        kw = {"headers": _headers(), "timeout": 15}
        if data is not None:
            kw["json"] = data
        r = fn(f"{Config.url}{path}", **kw)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {"_error": str(e)}


# ═══════════════════════════════════════════════════════════════
#  CONSTANTS
# ═══════════════════════════════════════════════════════════════

PREMIUM_FIELDS = [
    ("premiumEmoji",      "😎 Эмодзи профиля"),
    ("premiumBadge",      "🎖  Значок"),
    ("premiumNameColor",  "🎨 Цвет имени"),
    ("customStatus",      "💬 Кастомный статус"),
    ("customStatusEmoji", "🎭 Эмодзи статуса"),
    ("customStatusColor", "🌈 Цвет статуса"),
]

PREM_FEATURES = {
    "ghost":           "👻 Призрак (невидимка)",
    "emoji":           "😎 Эмодзи профиля",
    "badge":           "🎖  Значок профиля",
    "nameColor":       "🎨 Цвет имени",
    "exclusiveThemes": "🎭 Эксклюзивные темы",
    "customStatus":    "💬 Кастомный статус",
    "notifSounds":     "🔔 Звуки уведомлений",
    "socialLinks":     "🔗 Соц. ссылки",
    "banner":          "🖼  Баннер профиля",
    "translate":       "🌐 Перевод сообщений",
    "customTheme":     "🎨 Конструктор тем",
    "disappearing":    "💨 Исчезающие сообщения",
    "fonts":           "🔤 Кастомные шрифты",
    "bigUpload":       "📁 Большие файлы",
}

SUPER_FEATURES = {
    "broadcast": "📢 Рассылка всем",
    "announce":  "📣 Объявления",
    "moderate":  "🛡  Модерация",
    "seeHidden": "👁  Видеть скрытых",
    "animation": "✨ Анимация входа",
    "priority":  "⚡ Приоритет",
    "noLimits":  "♾  Без ограничений",
}

NAV = ["dashboard", "users", "premium", "tools", "settings"]


# ═══════════════════════════════════════════════════════════════
#  DASHBOARD
# ═══════════════════════════════════════════════════════════════

class DashboardPage(ScrollableContainer):
    def compose(self) -> ComposeResult:
        yield Static("📊  [bold]Главная панель[/]", classes="page-title")
        yield Static("[dim]Загрузка...[/]", id="stats-body")
        yield Button("🔄  Обновить статистику", id="btn-refresh-stats", variant="primary")

    def on_mount(self):
        self._load()

    @on(Button.Pressed, "#btn-refresh-stats")
    def _on_refresh(self):
        self._load()

    def _load(self):
        d = api("GET", "/api/admin/stats")
        el = self.query_one("#stats-body", Static)
        if "_error" in d:
            el.update(f"[red]❌ {d['_error']}[/]")
            return
        el.update(
            f"\n  👥  Пользователи   [bold cyan]{d.get('users', 0)}[/]\n"
            f"  💬  Чаты            [bold cyan]{d.get('chats', 0)}[/]\n"
            f"  ✉️   Сообщения       [bold cyan]{d.get('messages', 0)}[/]\n"
            f"  📡  Сессии          [bold cyan]{d.get('sessions', 0)}[/]\n"
            f"  🔔  Push-подписки   [bold cyan]{d.get('pushSubs', 0)}[/]\n\n"
            f"  [green]● Подключено к {Config.url}[/]\n"
        )


# ═══════════════════════════════════════════════════════════════
#  USERS
# ═══════════════════════════════════════════════════════════════

class UsersPage(ScrollableContainer):
    _users = []
    _selected_user = None
    _delete_confirm = None

    def compose(self) -> ComposeResult:
        yield Static("👥  [bold]Пользователи[/]", classes="page-title")
        yield DataTable(id="users-table")
        with Horizontal(classes="btn-row"):
            yield Button("🔄", id="btn-refresh-users", variant="primary")
            yield Button("👑 SuperUser", id="btn-toggle-su")
            yield Button("⭐ Premium", id="btn-toggle-prem")
            yield Button("🎛️  Функции", id="btn-show-feat")
            yield Button("❌ Удалить", id="btn-del-user", variant="error")
        yield Static("", id="user-status")
        yield Rule()
        yield Static("[bold]🎛️  Premium-функции выбранного пользователя[/]")
        yield Static(
            "[dim]← Кликните строку в таблице, затем нажмите «🎛️ Функции»[/]",
            id="feat-hint",
        )
        with Container(id="feat-form"):
            for field, label in PREMIUM_FIELDS:
                with Horizontal(classes="feature-row"):
                    yield Label(f"{label}:")
                    yield Input(id=f"feat-{field}", placeholder="...")
            yield Button("💾  Сохранить функции", id="btn-save-feat", variant="success")

    def on_mount(self):
        t = self.query_one("#users-table", DataTable)
        t.add_columns("#", "Имя", "@username", "Роль", "Био", "Дата")
        t.cursor_type = "row"
        self.query_one("#feat-form").display = False
        self._load()

    def _st(self, msg):
        self.query_one("#user-status", Static).update(msg)

    def _load(self):
        self._users = []
        t = self.query_one("#users-table", DataTable)
        t.clear()
        data = api("GET", "/api/admin/users")
        if isinstance(data, dict) and "_error" in data:
            self._st(f"[red]❌ {data['_error']}[/]")
            return
        self._users = data or []
        for i, u in enumerate(self._users, 1):
            role = ("⚡Super" if u.get("superUser")
                    else ("⭐Prem" if u.get("premium") else "—"))
            t.add_row(
                str(i),
                u.get("displayName") or "—",
                "@" + (u.get("username") or ""),
                role,
                (u.get("bio") or "—")[:20],
                (u.get("createdAt") or "")[:10],
            )
        self._st(f"[dim]Всего: {len(self._users)}[/]")

    def _sel(self):
        t = self.query_one("#users-table", DataTable)
        idx = t.cursor_row
        if idx is not None and 0 <= idx < len(self._users):
            return self._users[idx]
        return None

    @on(Button.Pressed, "#btn-refresh-users")
    def _on_refresh(self):
        self._load()

    @on(Button.Pressed, "#btn-toggle-su")
    def _on_su(self):
        u = self._sel()
        if not u:
            self._st("[yellow]⚠ Выберите пользователя в таблице[/]")
            return
        r = api("PUT", f"/api/admin/users/{u['_id']}/superuser")
        if "_error" not in r:
            st = "ВКЛ" if r.get("superUser") else "ВЫКЛ"
            self._st(f"[green]✓ @{r.get('username', '?')} → SuperUser {st}[/]")
            self._load()
        else:
            self._st(f"[red]✗ {r['_error']}[/]")

    @on(Button.Pressed, "#btn-toggle-prem")
    def _on_prem(self):
        u = self._sel()
        if not u:
            self._st("[yellow]⚠ Выберите пользователя в таблице[/]")
            return
        r = api("PUT", f"/api/admin/users/{u['_id']}/premium")
        if "_error" not in r:
            st = "ВКЛ" if r.get("premium") else "ВЫКЛ"
            self._st(f"[green]✓ @{r.get('username', '?')} → Premium {st}[/]")
            self._load()
        else:
            self._st(f"[red]✗ {r['_error']}[/]")

    @on(Button.Pressed, "#btn-show-feat")
    def _on_show_feat(self):
        u = self._sel()
        if not u:
            self._st("[yellow]⚠ Выберите пользователя в таблице[/]")
            return
        self._selected_user = u
        for field, _ in PREMIUM_FIELDS:
            self.query_one(f"#feat-{field}", Input).value = u.get(field) or ""
        self.query_one("#feat-form").display = True
        self.query_one("#feat-hint").display = False
        self._st(f"[cyan]Редактирование функций: @{u.get('username', '?')}[/]")

    @on(Button.Pressed, "#btn-save-feat")
    def _on_save_feat(self):
        if not self._selected_user:
            return
        data = {}
        for field, _ in PREMIUM_FIELDS:
            data[field] = self.query_one(f"#feat-{field}", Input).value
        r = api("PUT", f"/api/admin/users/{self._selected_user['_id']}/premium-features", data)
        if "_error" not in r:
            self._st(f"[green]✓ Функции сохранены для @{self._selected_user.get('username', '?')}[/]")
        else:
            self._st(f"[red]✗ {r['_error']}[/]")

    @on(Button.Pressed, "#btn-del-user")
    def _on_del(self):
        u = self._sel()
        if not u:
            self._st("[yellow]⚠ Выберите пользователя[/]")
            return
        name = u.get("displayName") or u.get("username", "?")
        if self._delete_confirm == u["_id"]:
            r = api("DELETE", f"/api/admin/users/{u['_id']}")
            if "_error" not in r:
                self._st(f"[green]✓ {name} удалён[/]")
                self._load()
            else:
                self._st(f"[red]✗ {r['_error']}[/]")
            self._delete_confirm = None
        else:
            self._delete_confirm = u["_id"]
            self._st(f"[bold yellow]⚠ Нажмите ❌ ещё раз для удаления {name}[/]")


# ═══════════════════════════════════════════════════════════════
#  PREMIUM
# ═══════════════════════════════════════════════════════════════

class PremiumPage(ScrollableContainer):
    def compose(self) -> ComposeResult:
        yield Static("⭐  [bold]Premium управление[/]", classes="page-title")
        yield Static("", id="prem-status")
        with Horizontal(classes="btn-row"):
            yield Button("⭐ Включить Premium", id="btn-prem-on", variant="warning")
            yield Button("☆  Выключить (бесплатно)", id="btn-prem-off")
            yield Button("🔄", id="btn-refresh-prem", variant="primary")
        yield Rule()
        yield Static("[bold magenta]Premium-функции[/]  [dim](кликните переключатель)[/]")
        for key, label in PREM_FEATURES.items():
            with Horizontal(classes="switch-row"):
                yield Switch(value=True, id=f"sw-p-{key}")
                yield Label(label)
        yield Rule()
        yield Static("[bold yellow]Super User функции[/]  [dim](кликните переключатель)[/]")
        for key, label in SUPER_FEATURES.items():
            with Horizontal(classes="switch-row"):
                yield Switch(value=True, id=f"sw-s-{key}")
                yield Label(label)
        yield Rule()
        with Horizontal(classes="btn-row"):
            yield Button("✅ Все ВКЛ", id="btn-feat-on", variant="success")
            yield Button("⬜ Все ВЫКЛ", id="btn-feat-off", variant="error")
            yield Button("💾 Сохранить", id="btn-feat-save", variant="primary")

    def on_mount(self):
        self._load()

    def _st(self, msg):
        self.query_one("#prem-status", Static).update(msg)

    @on(Button.Pressed, "#btn-refresh-prem")
    def _on_refresh(self):
        self._load()

    def _load(self):
        cfg = api("GET", "/api/admin/config/premium")
        if isinstance(cfg, dict) and "_error" not in cfg:
            ena = cfg.get("premiumEnabled", True)
            self._st(
                "[bold yellow]⭐ Premium ВКЛЮЧЁН[/]" if ena
                else "[bold green]☆ Premium ВЫКЛ — всё бесплатно[/]"
            )
        else:
            self._st("[dim]Статус неизвестен[/]")

        data = api("GET", "/api/admin/features")
        if isinstance(data, dict) and "_error" not in data:
            pd = data.get("premium", {})
            sd = data.get("super", {})
            for key in PREM_FEATURES:
                try:
                    self.query_one(f"#sw-p-{key}", Switch).value = pd.get(key, True)
                except Exception:
                    pass
            for key in SUPER_FEATURES:
                try:
                    self.query_one(f"#sw-s-{key}", Switch).value = sd.get(key, True)
                except Exception:
                    pass

    @on(Button.Pressed, "#btn-prem-on")
    def _on_on(self):
        r = api("PUT", "/api/admin/config/premium", {"enabled": True})
        self._st("[green]✓ Premium ВКЛЮЧЁН[/]" if "_error" not in r
                 else f"[red]✗ {r['_error']}[/]")

    @on(Button.Pressed, "#btn-prem-off")
    def _on_off(self):
        r = api("PUT", "/api/admin/config/premium", {"enabled": False})
        self._st("[green]✓ Premium ВЫКЛ — всё бесплатно[/]" if "_error" not in r
                 else f"[red]✗ {r['_error']}[/]")

    @on(Button.Pressed, "#btn-feat-on")
    def _on_all_on(self):
        for sw in self.query(Switch):
            sw.value = True

    @on(Button.Pressed, "#btn-feat-off")
    def _on_all_off(self):
        for sw in self.query(Switch):
            sw.value = False

    @on(Button.Pressed, "#btn-feat-save")
    def _on_save(self):
        prem = {}
        sup = {}
        for key in PREM_FEATURES:
            try:
                prem[key] = self.query_one(f"#sw-p-{key}", Switch).value
            except Exception:
                pass
        for key in SUPER_FEATURES:
            try:
                sup[key] = self.query_one(f"#sw-s-{key}", Switch).value
            except Exception:
                pass
        r = api("PUT", "/api/admin/features", {"premium": prem, "super": sup})
        self._st("[green]✓ Настройки функций сохранены[/]" if "_error" not in r
                 else f"[red]✗ {r['_error']}[/]")


# ═══════════════════════════════════════════════════════════════
#  TOOLS
# ═══════════════════════════════════════════════════════════════

class ToolsPage(ScrollableContainer):
    _confirm = None

    def compose(self) -> ComposeResult:
        yield Static("🔧  [bold]Инструменты[/]", classes="page-title")
        yield Static("", id="tools-status")
        yield Static("[bold]Рассылка и объявления:[/]")
        with Horizontal(classes="feature-row"):
            yield Label("📢 Рассылка:")
            yield Input(id="inp-broadcast", placeholder="Текст для всех пользователей...")
        yield Button(
            "📢  Отправить рассылку", id="btn-broadcast",
            variant="primary", classes="tool-btn",
        )
        with Horizontal(classes="feature-row"):
            yield Label("📣 Объявление:")
            yield Input(id="inp-announce", placeholder="Глобальное объявление...")
        yield Button(
            "📣  Отправить объявление", id="btn-announce",
            variant="primary", classes="tool-btn",
        )
        yield Rule()
        yield Static("[bold]Очистка данных:[/]")
        yield Button("✉️   Удалить все сообщения", id="btn-del-msgs", variant="warning", classes="tool-btn")
        yield Button("💬  Удалить все чаты", id="btn-del-chats", variant="warning", classes="tool-btn")
        yield Button("📡  Очистить сессии", id="btn-del-sess", classes="tool-btn")
        yield Button("🔔  Очистить push-подписки", id="btn-del-push", classes="tool-btn")
        yield Rule()
        yield Button("💥  ПОЛНЫЙ СБРОС БАЗЫ ДАННЫХ", id="btn-reset", variant="error", classes="tool-btn")

    def _st(self, msg):
        self.query_one("#tools-status", Static).update(msg)

    def _do(self, key, endpoint, desc, count_key):
        if self._confirm == key:
            r = api("DELETE", endpoint)
            if "_error" not in r:
                self._st(f"[green]✓ {desc}: удалено {r.get(count_key, 0)}[/]")
            else:
                self._st(f"[red]✗ {r['_error']}[/]")
            self._confirm = None
        else:
            self._confirm = key
            self._st(f"[yellow]⚠ Нажмите кнопку ещё раз для подтверждения: {desc}[/]")

    @on(Button.Pressed, "#btn-broadcast")
    def _on_bc(self):
        text = self.query_one("#inp-broadcast", Input).value.strip()
        if not text:
            self._st("[yellow]Введите текст рассылки[/]")
            return
        r = api("POST", "/api/broadcast", {"text": text})
        if "_error" not in r:
            self._st(f"[green]✓ Рассылка отправлена в {r.get('sentTo', 0)} чатов[/]")
            self.query_one("#inp-broadcast", Input).value = ""
        else:
            self._st(f"[red]✗ {r['_error']}[/]")

    @on(Button.Pressed, "#btn-announce")
    def _on_ann(self):
        text = self.query_one("#inp-announce", Input).value.strip()
        if not text:
            self._st("[yellow]Введите текст объявления[/]")
            return
        r = api("POST", "/api/announcement", {"text": text})
        if "_error" not in r:
            self._st("[green]✓ Объявление отправлено[/]")
            self.query_one("#inp-announce", Input).value = ""
        else:
            self._st(f"[red]✗ {r['_error']}[/]")

    @on(Button.Pressed, "#btn-del-msgs")
    def _d1(self):
        self._do("msgs", "/api/admin/messages", "Все сообщения", "deleted")

    @on(Button.Pressed, "#btn-del-chats")
    def _d2(self):
        self._do("chats", "/api/admin/chats", "Все чаты", "deletedChats")

    @on(Button.Pressed, "#btn-del-sess")
    def _d3(self):
        self._do("sess", "/api/admin/sessions", "Сессии", "deleted")

    @on(Button.Pressed, "#btn-del-push")
    def _d4(self):
        self._do("push", "/api/admin/pushsubs", "Push-подписки", "deleted")

    @on(Button.Pressed, "#btn-reset")
    def _on_reset(self):
        if self._confirm == "reset":
            r = api("DELETE", "/api/admin/reset")
            if "_error" not in r:
                total = sum(
                    v for k, v in r.items()
                    if k.startswith("deleted") and isinstance(v, int)
                )
                self._st(f"[green]✓ БД очищена! Удалено: {total}[/]")
            else:
                self._st(f"[red]✗ {r['_error']}[/]")
            self._confirm = None
        else:
            self._confirm = "reset"
            self._st("[bold red]⚠️  ВНИМАНИЕ! Нажмите ещё раз для ПОЛНОГО СБРОСА![/]")


# ═══════════════════════════════════════════════════════════════
#  SETTINGS
# ═══════════════════════════════════════════════════════════════

class SettingsPage(ScrollableContainer):
    def compose(self) -> ComposeResult:
        yield Static("⚙️  [bold]Настройки подключения[/]", classes="page-title")
        yield Label("URL сервера:")
        yield Input(value=Config.url, id="inp-url", placeholder="https://...")
        yield Label("Admin Key:")
        yield Input(value=Config.key, id="inp-key", password=True, placeholder="секретный ключ")
        with Horizontal(classes="btn-row"):
            yield Button("💾 Сохранить", id="btn-save-cfg", variant="primary")
            yield Button("🔌 Проверить соединение", id="btn-test-cfg", variant="success")
        yield Static("", id="cfg-status")

    @on(Button.Pressed, "#btn-save-cfg")
    def _on_save(self):
        Config.url = self.query_one("#inp-url", Input).value.rstrip("/")
        Config.key = self.query_one("#inp-key", Input).value
        self.query_one("#cfg-status", Static).update("[green]✓ Сохранено[/]")

    @on(Button.Pressed, "#btn-test-cfg")
    def _on_test(self):
        Config.url = self.query_one("#inp-url", Input).value.rstrip("/")
        Config.key = self.query_one("#inp-key", Input).value
        r = api("GET", "/api/admin/stats")
        st = self.query_one("#cfg-status", Static)
        if "_error" not in r:
            st.update(f"[green]● Подключено! Пользователей: {r.get('users', 0)}[/]")
        else:
            st.update(f"[red]● Ошибка: {r['_error']}[/]")


# ═══════════════════════════════════════════════════════════════
#  MAIN APP
# ═══════════════════════════════════════════════════════════════

class ShadowAdmin(App):
    TITLE = "Shadow Messenger — Admin Console"
    SUB_TITLE = "v4.9 Interactive TUI"

    CSS = """
    #main {
        height: 1fr;
    }
    #sidebar {
        width: 30;
        background: $surface;
        border-right: solid $primary;
        padding: 1;
    }
    .nav-btn {
        width: 100%;
        margin: 0 0 1 0;
    }
    #pages {
        width: 1fr;
        padding: 1 2;
    }
    .page-title {
        text-style: bold;
        margin-bottom: 1;
    }
    .btn-row {
        height: auto;
        margin: 1 0;
    }
    .btn-row > Button {
        margin: 0 1 0 0;
    }
    .switch-row {
        height: 3;
    }
    .switch-row > Label {
        padding: 1 0 0 1;
    }
    .feature-row {
        height: 3;
    }
    .feature-row > Label {
        width: 22;
        padding: 1 0 0 0;
    }
    .feature-row > Input {
        width: 1fr;
    }
    DataTable {
        height: 14;
        margin-bottom: 1;
    }
    .tool-btn {
        margin: 0 0 1 0;
        width: 100%;
    }
    Rule {
        margin: 1 0;
    }
    #feat-form {
        margin-top: 1;
        padding: 1;
        border: solid $primary;
    }
    """

    BINDINGS = [
        Binding("q", "quit", "Выход"),
        Binding("1", "go('dashboard')", "Панель", show=False),
        Binding("2", "go('users')", "Польз.", show=False),
        Binding("3", "go('premium')", "Premium", show=False),
        Binding("4", "go('tools')", "Инстр.", show=False),
        Binding("5", "go('settings')", "Настр.", show=False),
    ]

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Horizontal(id="main"):
            with Vertical(id="sidebar"):
                yield Static("[bold magenta]🌌 Shadow Admin[/]\n")
                yield Button("📊  Панель", id="nav-dashboard", classes="nav-btn", variant="primary")
                yield Button("👥  Пользователи", id="nav-users", classes="nav-btn")
                yield Button("⭐  Premium", id="nav-premium", classes="nav-btn")
                yield Button("🔧  Инструменты", id="nav-tools", classes="nav-btn")
                yield Button("⚙️  Настройки", id="nav-settings", classes="nav-btn")
            with ContentSwitcher(id="pages", initial="page-dashboard"):
                yield DashboardPage(id="page-dashboard")
                yield UsersPage(id="page-users")
                yield PremiumPage(id="page-premium")
                yield ToolsPage(id="page-tools")
                yield SettingsPage(id="page-settings")
        yield Footer()

    def _switch(self, name):
        self.query_one("#pages", ContentSwitcher).current = f"page-{name}"
        for p in NAV:
            self.query_one(f"#nav-{p}", Button).variant = (
                "primary" if p == name else "default"
            )

    def action_go(self, name):
        self._switch(name)

    @on(Button.Pressed, "#nav-dashboard")
    def _n1(self):
        self._switch("dashboard")

    @on(Button.Pressed, "#nav-users")
    def _n2(self):
        self._switch("users")

    @on(Button.Pressed, "#nav-premium")
    def _n3(self):
        self._switch("premium")

    @on(Button.Pressed, "#nav-tools")
    def _n4(self):
        self._switch("tools")

    @on(Button.Pressed, "#nav-settings")
    def _n5(self):
        self._switch("settings")


if __name__ == "__main__":
    ShadowAdmin().run()
