#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Shadow Mess — Красивая панель управления (tkinter GUI)
Тёмная тема, современный дизайн, управление пользователями и БД
"""

import os
import sys
import json
import threading
import urllib.request
import urllib.error
import tkinter as tk
from tkinter import ttk, messagebox, font as tkfont

# ═══════════════════════════════════════════════════════════
# НАСТРОЙКИ
# ═══════════════════════════════════════════════════════════
DEFAULT_SERVER = "https://shadow-mess.onrender.com"
ADMIN_KEY = "shadow_admin_secret_2026"

# ═══════════════════════════════════════════════════════════
# ЦВЕТОВАЯ СХЕМА (Тёмная тема)
# ═══════════════════════════════════════════════════════════
COLORS = {
    "bg":           "#0f0f1a",
    "bg_card":      "#181828",
    "bg_sidebar":   "#12121f",
    "bg_hover":     "#1e1e35",
    "bg_input":     "#1a1a2e",
    "accent":       "#6c5ce7",
    "accent_hover": "#7c6cf7",
    "accent_light": "#6c5ce720",
    "success":      "#22c55e",
    "danger":       "#ef4444",
    "danger_hover": "#dc2626",
    "warning":      "#f59e0b",
    "text":         "#e8e8f0",
    "text_sec":     "#8888aa",
    "text_dim":     "#555570",
    "border":       "#2a2a40",
    "border_light": "#35354d",
}

# ═══════════════════════════════════════════════════════════
# API
# ═══════════════════════════════════════════════════════════
SERVER = DEFAULT_SERVER

def api(method, path, body=None):
    url = f"{SERVER}{path}"
    headers = {
        "X-Admin-Key": ADMIN_KEY,
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode() if e.fp else ""
        try:
            err = json.loads(body_text)
            raise Exception(err.get("error", f"HTTP {e.code}"))
        except json.JSONDecodeError:
            raise Exception(f"HTTP {e.code}: {body_text[:200]}")
    except urllib.error.URLError as e:
        raise Exception(f"Ошибка подключения: {e.reason}")


# ═══════════════════════════════════════════════════════════
# ГЛАВНЫЙ КЛАСС ПРИЛОЖЕНИЯ
# ═══════════════════════════════════════════════════════════
class ShadowAdminApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Shadow Mess — Админ-панель")
        self.geometry("1000x650")
        self.minsize(850, 550)
        self.configure(bg=COLORS["bg"])

        # Иконка (если есть)
        try:
            self.iconbitmap(default="")
        except:
            pass

        # Стили ttk
        self.style = ttk.Style(self)
        self.style.theme_use("clam")
        self._configure_styles()

        # Шрифты
        self.font_title = tkfont.Font(family="Segoe UI", size=18, weight="bold")
        self.font_header = tkfont.Font(family="Segoe UI", size=13, weight="bold")
        self.font_normal = tkfont.Font(family="Segoe UI", size=11)
        self.font_small = tkfont.Font(family="Segoe UI", size=10)
        self.font_mono = tkfont.Font(family="Consolas", size=10)

        # Layout
        self._build_ui()
        self._show_dashboard()

    def _configure_styles(self):
        s = self.style

        # Treeview
        s.configure("Dark.Treeview",
            background=COLORS["bg_card"],
            foreground=COLORS["text"],
            fieldbackground=COLORS["bg_card"],
            borderwidth=0,
            rowheight=36,
            font=("Segoe UI", 10)
        )
        s.configure("Dark.Treeview.Heading",
            background=COLORS["bg_sidebar"],
            foreground=COLORS["text_sec"],
            borderwidth=0,
            font=("Segoe UI", 10, "bold"),
            relief="flat"
        )
        s.map("Dark.Treeview",
            background=[("selected", COLORS["accent_light"])],
            foreground=[("selected", COLORS["accent"])]
        )
        s.map("Dark.Treeview.Heading",
            background=[("active", COLORS["bg_hover"])]
        )

        # Scrollbar
        s.configure("Dark.Vertical.TScrollbar",
            background=COLORS["bg_card"],
            troughcolor=COLORS["bg"],
            borderwidth=0,
            arrowsize=0,
            width=8
        )
        s.map("Dark.Vertical.TScrollbar",
            background=[("active", COLORS["border_light"]), ("!active", COLORS["border"])]
        )

    # ─────────────────────────────────────────────────────────
    # UI СТРОИТЕЛЬСТВО
    # ─────────────────────────────────────────────────────────
    def _build_ui(self):
        # Sidebar
        self.sidebar = tk.Frame(self, bg=COLORS["bg_sidebar"], width=220)
        self.sidebar.pack(side="left", fill="y")
        self.sidebar.pack_propagate(False)

        # Logo
        logo_frame = tk.Frame(self.sidebar, bg=COLORS["bg_sidebar"])
        logo_frame.pack(fill="x", padx=16, pady=(20, 8))
        tk.Label(logo_frame, text="◆", font=("Segoe UI", 20), fg=COLORS["accent"],
                 bg=COLORS["bg_sidebar"]).pack(side="left")
        tk.Label(logo_frame, text=" Shadow Mess", font=("Segoe UI", 14, "bold"),
                 fg=COLORS["text"], bg=COLORS["bg_sidebar"]).pack(side="left", padx=(4, 0))

        tk.Label(self.sidebar, text="Панель управления", font=("Segoe UI", 9),
                 fg=COLORS["text_dim"], bg=COLORS["bg_sidebar"]).pack(padx=16, anchor="w")

        # Separator
        sep = tk.Frame(self.sidebar, bg=COLORS["border"], height=1)
        sep.pack(fill="x", padx=16, pady=(12, 12))

        # Menu buttons
        self.menu_buttons = []
        menu_items = [
            ("📊", "Статистика", self._show_dashboard),
            ("👤", "Пользователи", self._show_users),
            ("💬", "Сообщения", self._show_messages),
            ("💭", "Чаты", self._show_chats),
            ("🔑", "Сессии", self._show_sessions),
            ("🔔", "Push-подписки", self._show_push),
        ]

        for icon, text, command in menu_items:
            btn = self._create_menu_btn(self.sidebar, f"{icon}  {text}", command)
            self.menu_buttons.append(btn)

        # Spacer
        tk.Frame(self.sidebar, bg=COLORS["bg_sidebar"]).pack(fill="both", expand=True)

        # Danger zone
        sep2 = tk.Frame(self.sidebar, bg=COLORS["border"], height=1)
        sep2.pack(fill="x", padx=16, pady=(0, 12))
        tk.Label(self.sidebar, text="ОПАСНАЯ ЗОНА", font=("Segoe UI", 8, "bold"),
                 fg=COLORS["danger"], bg=COLORS["bg_sidebar"]).pack(padx=16, anchor="w", pady=(0, 4))

        reset_btn = self._create_menu_btn(self.sidebar, "🔥  Полный сброс", self._full_reset, danger=True)
        self.menu_buttons.append(reset_btn)

        # Server info
        tk.Label(self.sidebar, text=f"Сервер:", font=("Segoe UI", 8),
                 fg=COLORS["text_dim"], bg=COLORS["bg_sidebar"]).pack(padx=16, anchor="w", pady=(12, 0))
        self.server_label = tk.Label(self.sidebar, text=DEFAULT_SERVER.replace("https://", ""),
                 font=("Consolas", 8), fg=COLORS["text_sec"], bg=COLORS["bg_sidebar"])
        self.server_label.pack(padx=16, anchor="w", pady=(0, 16))

        # Main content
        self.content = tk.Frame(self, bg=COLORS["bg"])
        self.content.pack(side="left", fill="both", expand=True)

    def _create_menu_btn(self, parent, text, command, danger=False):
        fg = COLORS["danger"] if danger else COLORS["text_sec"]
        hover_bg = "rgba(239,68,68,.1)" if danger else COLORS["bg_hover"]

        btn = tk.Label(parent, text=text, font=("Segoe UI", 11), fg=fg,
                       bg=COLORS["bg_sidebar"], anchor="w", padx=16, pady=8, cursor="hand2")
        btn.pack(fill="x", padx=8, pady=1)
        btn._command = command
        btn._default_bg = COLORS["bg_sidebar"]
        btn._hover_bg = COLORS["bg_hover"]
        btn._active_bg = COLORS["accent_light"]
        btn._danger = danger

        btn.bind("<Enter>", lambda e, b=btn: b.configure(bg=b._hover_bg))
        btn.bind("<Leave>", lambda e, b=btn: b.configure(bg=b._active_bg if getattr(b, '_is_active', False) else b._default_bg))
        btn.bind("<Button-1>", lambda e, b=btn: self._on_menu_click(b))
        return btn

    def _on_menu_click(self, btn):
        # Deactivate all
        for b in self.menu_buttons:
            b._is_active = False
            b.configure(bg=b._default_bg, fg=COLORS["danger"] if b._danger else COLORS["text_sec"])
        # Activate clicked
        btn._is_active = True
        btn.configure(bg=btn._active_bg, fg=COLORS["accent"] if not btn._danger else COLORS["danger"])
        # Execute
        btn._command()

    def _clear_content(self):
        for w in self.content.winfo_children():
            w.destroy()

    def _create_header(self, title, subtitle=""):
        frame = tk.Frame(self.content, bg=COLORS["bg"])
        frame.pack(fill="x", padx=30, pady=(24, 4))
        tk.Label(frame, text=title, font=self.font_title, fg=COLORS["text"], bg=COLORS["bg"]).pack(anchor="w")
        if subtitle:
            tk.Label(frame, text=subtitle, font=self.font_small, fg=COLORS["text_sec"], bg=COLORS["bg"]).pack(anchor="w", pady=(2, 0))
        return frame

    def _create_card(self, parent, **kwargs):
        card = tk.Frame(parent, bg=COLORS["bg_card"], highlightbackground=COLORS["border"],
                        highlightthickness=1, **kwargs)
        return card

    def _create_button(self, parent, text, command, style="primary", width=None):
        colors = {
            "primary":   (COLORS["accent"], COLORS["accent_hover"], "#fff"),
            "danger":    (COLORS["danger"], COLORS["danger_hover"], "#fff"),
            "secondary": (COLORS["bg_hover"], COLORS["border_light"], COLORS["text_sec"]),
        }
        bg, hover, fg = colors.get(style, colors["primary"])

        btn = tk.Label(parent, text=text, font=("Segoe UI", 10, "bold"), fg=fg, bg=bg,
                       padx=16, pady=8, cursor="hand2")
        if width:
            btn.configure(width=width)
        btn.bind("<Enter>", lambda e: btn.configure(bg=hover))
        btn.bind("<Leave>", lambda e: btn.configure(bg=bg))
        btn.bind("<Button-1>", lambda e: command())

        # Rounded corners simulation
        btn.configure(relief="flat", borderwidth=0)
        return btn

    def _create_stat_card(self, parent, icon, label, value, color=None):
        card = self._create_card(parent)
        card.configure(padx=16, pady=14)

        top = tk.Frame(card, bg=COLORS["bg_card"])
        top.pack(fill="x")
        tk.Label(top, text=icon, font=("Segoe UI", 20), bg=COLORS["bg_card"]).pack(side="left")
        tk.Label(top, text=label, font=self.font_small, fg=COLORS["text_sec"],
                 bg=COLORS["bg_card"]).pack(side="left", padx=(8, 0))

        val_color = color or COLORS["text"]
        tk.Label(card, text=str(value), font=("Segoe UI", 24, "bold"), fg=val_color,
                 bg=COLORS["bg_card"]).pack(anchor="w", pady=(6, 0))
        return card

    def _loading(self, text="Загрузка..."):
        self._clear_content()
        frame = tk.Frame(self.content, bg=COLORS["bg"])
        frame.pack(fill="both", expand=True)
        tk.Label(frame, text=text, font=self.font_normal,
                 fg=COLORS["text_sec"], bg=COLORS["bg"]).pack(expand=True)

    def _threaded(self, func, callback=None):
        """Run func in thread, call callback(result) in main thread"""
        def wrapper():
            try:
                result = func()
                if callback:
                    self.after(0, lambda: callback(result))
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Ошибка", str(e)))
        t = threading.Thread(target=wrapper, daemon=True)
        t.start()

    # ─────────────────────────────────────────────────────────
    # DASHBOARD (Статистика)
    # ─────────────────────────────────────────────────────────
    def _show_dashboard(self):
        self._loading()
        self._threaded(
            lambda: api("GET", "/api/admin/stats"),
            self._render_dashboard
        )

    def _render_dashboard(self, stats):
        self._clear_content()
        self._create_header("📊 Статистика", "Обзор базы данных Shadow Mess")

        # Separator
        tk.Frame(self.content, bg=COLORS["border"], height=1).pack(fill="x", padx=30, pady=(12, 16))

        # Stats grid
        grid = tk.Frame(self.content, bg=COLORS["bg"])
        grid.pack(fill="x", padx=30)

        items = [
            ("👤", "Пользователей", stats.get("users", 0), COLORS["accent"]),
            ("💭", "Чатов", stats.get("chats", 0), COLORS["success"]),
            ("💬", "Сообщений", stats.get("messages", 0), COLORS["warning"]),
            ("🔑", "Сессий", stats.get("sessions", 0), COLORS["text"]),
            ("🔔", "Push-подписок", stats.get("pushSubs", 0), COLORS["text_sec"]),
        ]

        for i, (icon, label, value, color) in enumerate(items):
            card = self._create_stat_card(grid, icon, label, value, color)
            card.grid(row=i // 3, column=i % 3, padx=6, pady=6, sticky="nsew")

        for c in range(3):
            grid.columnconfigure(c, weight=1)

        # Refresh button
        btn_frame = tk.Frame(self.content, bg=COLORS["bg"])
        btn_frame.pack(fill="x", padx=30, pady=(20, 0))
        self._create_button(btn_frame, "🔄  Обновить", self._show_dashboard, "secondary").pack(side="left")

    # ─────────────────────────────────────────────────────────
    # USERS (Пользователи)
    # ─────────────────────────────────────────────────────────
    def _show_users(self):
        self._loading()
        self._threaded(
            lambda: api("GET", "/api/admin/users"),
            self._render_users
        )

    def _render_users(self, users):
        self._clear_content()
        self._create_header("👤 Пользователи", f"Всего: {len(users)} зарегистрированных")

        # Actions bar
        bar = tk.Frame(self.content, bg=COLORS["bg"])
        bar.pack(fill="x", padx=30, pady=(12, 8))
        self._create_button(bar, "🔄 Обновить", self._show_users, "secondary").pack(side="left", padx=(0, 8))
        self._create_button(bar, "🗑 Удалить выбранного", self._delete_selected_user, "danger").pack(side="left", padx=(0, 8))
        self._create_button(bar, "⚠ Удалить всех", self._delete_all_users, "danger").pack(side="right")

        # Treeview
        tree_frame = tk.Frame(self.content, bg=COLORS["bg_card"])
        tree_frame.pack(fill="both", expand=True, padx=30, pady=(0, 20))

        cols = ("username", "displayName", "createdAt", "lastSeen", "id")
        self.users_tree = ttk.Treeview(tree_frame, columns=cols, show="headings", style="Dark.Treeview")

        self.users_tree.heading("username", text="@username")
        self.users_tree.heading("displayName", text="Имя")
        self.users_tree.heading("createdAt", text="Регистрация")
        self.users_tree.heading("lastSeen", text="Последний визит")
        self.users_tree.heading("id", text="ID")

        self.users_tree.column("username", width=140)
        self.users_tree.column("displayName", width=160)
        self.users_tree.column("createdAt", width=120)
        self.users_tree.column("lastSeen", width=120)
        self.users_tree.column("id", width=200)

        scrollbar = ttk.Scrollbar(tree_frame, orient="vertical", command=self.users_tree.yview, style="Dark.Vertical.TScrollbar")
        self.users_tree.configure(yscrollcommand=scrollbar.set)

        self.users_tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # Populate
        self._users_data = users
        for u in users:
            uid = u.get("_id") or u.get("id", "?")
            self.users_tree.insert("", "end", values=(
                f"@{u.get('username', '?')}",
                u.get("displayName", "—"),
                u.get("createdAt", "")[:10],
                u.get("lastSeen", "—")[:10] if u.get("lastSeen") else "—",
                uid
            ))

        # Double-click to view details
        self.users_tree.bind("<Double-1>", self._user_detail)

    def _delete_selected_user(self):
        sel = self.users_tree.selection()
        if not sel:
            messagebox.showwarning("Внимание", "Выберите пользователя в таблице")
            return
        values = self.users_tree.item(sel[0])["values"]
        uname = values[0]
        uid = values[4]
        name = values[1]

        if not messagebox.askyesno("Подтверждение", f"Удалить пользователя {name} ({uname})?"):
            return

        self._threaded(
            lambda: api("DELETE", f"/api/admin/users/{uid}"),
            lambda r: (messagebox.showinfo("Готово", f"Пользователь {uname} удалён\n"
                                           f"Сообщений: {r.get('deletedMessages', 0)}\n"
                                           f"Сессий: {r.get('deletedSessions', 0)}\n"
                                           f"Чатов: {r.get('deletedChats', 0)}"),
                       self._show_users())
        )

    def _delete_all_users(self):
        if not messagebox.askyesno("⚠ Внимание", "Удалить ВСЕХ пользователей?\nЭто действие необратимо!"):
            return
        self._threaded(
            lambda: api("DELETE", "/api/admin/users"),
            lambda r: (messagebox.showinfo("Готово", f"Удалено: {r.get('deleted', 0)} пользователей"),
                       self._show_users())
        )

    def _user_detail(self, event):
        sel = self.users_tree.selection()
        if not sel:
            return
        values = self.users_tree.item(sel[0])["values"]
        uid = values[4]

        # Найти полные данные
        user = None
        for u in self._users_data:
            if (u.get("_id") or u.get("id")) == uid:
                user = u
                break
        if not user:
            return

        # Popup с деталями
        win = tk.Toplevel(self)
        win.title(f"Пользователь — {user.get('displayName', '?')}")
        win.geometry("400x420")
        win.configure(bg=COLORS["bg_card"])
        win.resizable(False, False)

        # Center on parent
        win.transient(self)
        win.grab_set()

        pad = {"padx": 20, "pady": 2}

        tk.Label(win, text=user.get("displayName", "?"), font=("Segoe UI", 16, "bold"),
                 fg=COLORS["text"], bg=COLORS["bg_card"]).pack(pady=(20, 0), **{"padx": 20})
        tk.Label(win, text=f"@{user.get('username', '?')}", font=("Segoe UI", 12),
                 fg=COLORS["accent"], bg=COLORS["bg_card"]).pack(**pad)

        tk.Frame(win, bg=COLORS["border"], height=1).pack(fill="x", padx=20, pady=10)

        fields = [
            ("ID", (user.get("_id") or user.get("id", "?"))),
            ("Имя", user.get("firstName", "—")),
            ("Фамилия", user.get("lastName", "—")),
            ("Bio", user.get("bio", "—") or "—"),
            ("Аватар", "Загружен" if user.get("avatar") else "Нет"),
            ("Цвет", user.get("avatarColor", "—")),
            ("Регистрация", user.get("createdAt", "?")[:19].replace("T", " ")),
            ("Последний визит", (user.get("lastSeen", "?") or "—")[:19].replace("T", " ")),
            ("В сети", "Да" if user.get("online") else "Нет"),
        ]

        for label, value in fields:
            row = tk.Frame(win, bg=COLORS["bg_card"])
            row.pack(fill="x", padx=20, pady=2)
            tk.Label(row, text=f"{label}:", font=("Segoe UI", 10, "bold"),
                     fg=COLORS["text_sec"], bg=COLORS["bg_card"], width=14, anchor="w").pack(side="left")
            tk.Label(row, text=str(value)[:50], font=("Segoe UI", 10),
                     fg=COLORS["text"], bg=COLORS["bg_card"], anchor="w").pack(side="left", fill="x", expand=True)

        tk.Frame(win, bg=COLORS["border"], height=1).pack(fill="x", padx=20, pady=10)

        # Delete button
        del_btn = self._create_button(win, "🗑 Удалить пользователя", 
                                       lambda: self._confirm_delete_user(win, user), "danger")
        del_btn.pack(padx=20, pady=(4, 16), fill="x")

    def _confirm_delete_user(self, win, user):
        uid = user.get("_id") or user.get("id")
        name = user.get("displayName", user.get("username", "?"))
        if messagebox.askyesno("Подтверждение", f"Удалить {name}?", parent=win):
            win.destroy()
            self._threaded(
                lambda: api("DELETE", f"/api/admin/users/{uid}"),
                lambda r: (messagebox.showinfo("Готово", f"Удалён: @{r.get('username', '?')}"),
                           self._show_users())
            )

    # ─────────────────────────────────────────────────────────
    # MESSAGES (Сообщения)
    # ─────────────────────────────────────────────────────────
    def _show_messages(self):
        self._clear_content()
        self._create_header("💬 Сообщения", "Управление сообщениями в базе данных")

        tk.Frame(self.content, bg=COLORS["border"], height=1).pack(fill="x", padx=30, pady=(12, 20))

        card = self._create_card(self.content)
        card.pack(fill="x", padx=30, pady=8)
        inner = tk.Frame(card, bg=COLORS["bg_card"], padx=20, pady=20)
        inner.pack(fill="x")

        tk.Label(inner, text="🗑  Удалить все сообщения", font=self.font_header,
                 fg=COLORS["text"], bg=COLORS["bg_card"]).pack(anchor="w")
        tk.Label(inner, text="Это удалит ВСЕ сообщения из всех чатов. Действие необратимо.",
                 font=self.font_small, fg=COLORS["text_sec"], bg=COLORS["bg_card"]).pack(anchor="w", pady=(4, 12))
        self._create_button(inner, "Удалить все сообщения", self._delete_messages, "danger").pack(anchor="w")

    def _delete_messages(self):
        if not messagebox.askyesno("Подтверждение", "Удалить ВСЕ сообщения?"):
            return
        self._threaded(
            lambda: api("DELETE", "/api/admin/messages"),
            lambda r: messagebox.showinfo("Готово", f"Удалено: {r.get('deleted', 0)} сообщений")
        )

    # ─────────────────────────────────────────────────────────
    # CHATS (Чаты)
    # ─────────────────────────────────────────────────────────
    def _show_chats(self):
        self._clear_content()
        self._create_header("💭 Чаты", "Управление чатами")

        tk.Frame(self.content, bg=COLORS["border"], height=1).pack(fill="x", padx=30, pady=(12, 20))

        card = self._create_card(self.content)
        card.pack(fill="x", padx=30, pady=8)
        inner = tk.Frame(card, bg=COLORS["bg_card"], padx=20, pady=20)
        inner.pack(fill="x")

        tk.Label(inner, text="🗑  Удалить все чаты", font=self.font_header,
                 fg=COLORS["text"], bg=COLORS["bg_card"]).pack(anchor="w")
        tk.Label(inner, text="Удалит все чаты и связанные с ними сообщения. Необратимо.",
                 font=self.font_small, fg=COLORS["text_sec"], bg=COLORS["bg_card"]).pack(anchor="w", pady=(4, 12))
        self._create_button(inner, "Удалить все чаты", self._delete_chats, "danger").pack(anchor="w")

    def _delete_chats(self):
        if not messagebox.askyesno("Подтверждение", "Удалить ВСЕ чаты и сообщения?"):
            return
        self._threaded(
            lambda: api("DELETE", "/api/admin/chats"),
            lambda r: messagebox.showinfo("Готово",
                f"Чатов: {r.get('deletedChats', 0)}\nСообщений: {r.get('deletedMessages', 0)}")
        )

    # ─────────────────────────────────────────────────────────
    # SESSIONS (Сессии)
    # ─────────────────────────────────────────────────────────
    def _show_sessions(self):
        self._clear_content()
        self._create_header("🔑 Сессии", "Управление пользовательскими сессиями")

        tk.Frame(self.content, bg=COLORS["border"], height=1).pack(fill="x", padx=30, pady=(12, 20))

        card = self._create_card(self.content)
        card.pack(fill="x", padx=30, pady=8)
        inner = tk.Frame(card, bg=COLORS["bg_card"], padx=20, pady=20)
        inner.pack(fill="x")

        tk.Label(inner, text="🧹  Очистить неактивные сессии", font=self.font_header,
                 fg=COLORS["text"], bg=COLORS["bg_card"]).pack(anchor="w")
        tk.Label(inner, text="Удаляет истёкшие и неактивные сессии из базы данных.",
                 font=self.font_small, fg=COLORS["text_sec"], bg=COLORS["bg_card"]).pack(anchor="w", pady=(4, 12))
        self._create_button(inner, "Очистить сессии", self._delete_sessions, "secondary").pack(anchor="w")

    def _delete_sessions(self):
        if not messagebox.askyesno("Подтверждение", "Очистить неактивные сессии?"):
            return
        self._threaded(
            lambda: api("DELETE", "/api/admin/sessions"),
            lambda r: messagebox.showinfo("Готово", f"Удалено: {r.get('deleted', 0)} сессий")
        )

    # ─────────────────────────────────────────────────────────
    # PUSH (Подписки)
    # ─────────────────────────────────────────────────────────
    def _show_push(self):
        self._clear_content()
        self._create_header("🔔 Push-подписки", "Управление push-уведомлениями")

        tk.Frame(self.content, bg=COLORS["border"], height=1).pack(fill="x", padx=30, pady=(12, 20))

        card = self._create_card(self.content)
        card.pack(fill="x", padx=30, pady=8)
        inner = tk.Frame(card, bg=COLORS["bg_card"], padx=20, pady=20)
        inner.pack(fill="x")

        tk.Label(inner, text="🧹  Очистить push-подписки", font=self.font_header,
                 fg=COLORS["text"], bg=COLORS["bg_card"]).pack(anchor="w")
        tk.Label(inner, text="Удаляет все push-подписки. Пользователи перестанут получать push-уведомления.",
                 font=self.font_small, fg=COLORS["text_sec"], bg=COLORS["bg_card"]).pack(anchor="w", pady=(4, 12))
        self._create_button(inner, "Очистить подписки", self._delete_push, "secondary").pack(anchor="w")

    def _delete_push(self):
        if not messagebox.askyesno("Подтверждение", "Очистить все push-подписки?"):
            return
        self._threaded(
            lambda: api("DELETE", "/api/admin/pushsubs"),
            lambda r: messagebox.showinfo("Готово", f"Удалено: {r.get('deleted', 0)} подписок")
        )

    # ─────────────────────────────────────────────────────────
    # FULL RESET
    # ─────────────────────────────────────────────────────────
    def _full_reset(self):
        if not messagebox.askyesno("⚠ ПОЛНЫЙ СБРОС",
            "ЭТО УДАЛИТ ВСЮ БАЗУ ДАННЫХ!\n\n"
            "• Всех пользователей\n"
            "• Все чаты и сообщения\n"
            "• Все сессии\n"
            "• Все push-подписки\n\n"
            "Продолжить?"):
            return
        if not messagebox.askyesno("Последнее предупреждение",
            "Вы ТОЧНО уверены? Это действие НЕЛЬЗЯ отменить!"):
            return

        self._threaded(
            lambda: api("DELETE", "/api/admin/reset"),
            lambda r: messagebox.showinfo("Сброс выполнен",
                f"Удалено:\n"
                f"  Пользователей: {r.get('deletedUsers', 0)}\n"
                f"  Чатов: {r.get('deletedChats', 0)}\n"
                f"  Сообщений: {r.get('deletedMessages', 0)}\n"
                f"  Сессий: {r.get('deletedSessions', 0)}")
        )


# ═══════════════════════════════════════════════════════════
# ЗАПУСК
# ═══════════════════════════════════════════════════════════
def main():
    global SERVER

    # Диалог ввода сервера через простой inputbox
    import tkinter.simpledialog as sd

    tmp = tk.Tk()
    tmp.withdraw()
    tmp.title("Shadow Mess")
    # Чтобы окно отобразилось поверх всех
    tmp.attributes("-topmost", True)

    result = sd.askstring(
        "Shadow Mess — Подключение",
        "Введите URL сервера:\n(Enter = по умолчанию)",
        initialvalue=DEFAULT_SERVER,
        parent=tmp
    )
    tmp.destroy()

    SERVER = (result or "").strip().rstrip("/") or DEFAULT_SERVER

    # Main app
    app = ShadowAdminApp()
    # Центрируем окно
    app.update_idletasks()
    w, h = 1000, 650
    x = (app.winfo_screenwidth() - w) // 2
    y = (app.winfo_screenheight() - h) // 2
    app.geometry(f"{w}x{h}+{x}+{y}")
    app.mainloop()


if __name__ == "__main__":
    main()
