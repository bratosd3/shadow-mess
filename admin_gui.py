#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Shadow Mess v3.0 — Admin Panel (CustomTkinter)
Rebuilt from scratch with modern design, better UX, and full management.
"""

import os, sys, json, threading, time, webbrowser
import urllib.request, urllib.error
import tkinter as tk
from tkinter import messagebox
from datetime import datetime

try:
    import customtkinter as ctk
except ImportError:
    print("Installing customtkinter...")
    os.system(f'"{sys.executable}" -m pip install customtkinter')
    import customtkinter as ctk

# ═══════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════
DEFAULT_SERVER = "https://shadow-mess.onrender.com"
ADMIN_KEY      = "shadow_admin_secret_2026"
SERVER         = DEFAULT_SERVER
VERSION        = "3.0"

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

# ═══════════════════════════════════════════════════════════
# THEME
# ═══════════════════════════════════════════════════════════
T = {
    # Backgrounds
    "bg":           "#0b0b14",
    "bg_sidebar":   "#08080f",
    "bg_card":      "#12121e",
    "bg_card2":     "#181828",
    "bg_input":     "#0f0f1a",
    "bg_hover":     "#1a1a2e",
    "bg_selected":  "#1e1e3a",
    "bg_header":    "#10101c",
    "bg_danger":    "#1a0a0a",
    # Accents
    "accent":       "#7c3aed",
    "accent_light": "#a78bfa",
    "accent_dim":   "#5b21b6",
    "accent_bg":    "#1a1036",
    # Status
    "green":        "#22c55e",
    "green_dim":    "#15803d",
    "red":          "#ef4444",
    "red_dim":      "#991b1b",
    "yellow":       "#f59e0b",
    "blue":         "#3b82f6",
    "cyan":         "#06b6d4",
    "orange":       "#f97316",
    # Text
    "text":         "#e8e8f0",
    "text2":        "#8888a8",
    "text3":        "#555570",
    "text_inv":     "#ffffff",
    # Borders
    "border":       "#1e1e30",
    "border_light": "#2a2a44",
}


# ═══════════════════════════════════════════════════════════
# API
# ═══════════════════════════════════════════════════════════
def api(method, path, body=None):
    """Make an API request to the server."""
    url = f"{SERVER}{path}"
    headers = {"X-Admin-Key": ADMIN_KEY, "Content-Type": "application/json"}
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


def fmt_date(iso_str):
    """Format ISO date string to readable format."""
    if not iso_str:
        return "—"
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.strftime("%d.%m.%Y %H:%M")
    except:
        return iso_str[:16].replace("T", " ") if iso_str else "—"


# ═══════════════════════════════════════════════════════════
# TOAST NOTIFICATION
# ═══════════════════════════════════════════════════════════
class Toast:
    """Floating toast notification."""
    _active = []

    @staticmethod
    def show(parent, text, kind="info", duration=3000):
        colors = {
            "info":    (T["accent"], T["accent_bg"]),
            "success": (T["green"],  "#0a1a0f"),
            "error":   (T["red"],    T["bg_danger"]),
            "warning": (T["yellow"], "#1a1a0a"),
        }
        fg, bg = colors.get(kind, colors["info"])

        toast = ctk.CTkFrame(parent, fg_color=bg, corner_radius=12,
                             border_width=1, border_color=fg)
        toast.place(relx=0.5, rely=0.05, anchor="n")

        icons = {"info": "ℹ", "success": "✓", "error": "✕", "warning": "⚠"}
        label = ctk.CTkLabel(toast, text=f"  {icons.get(kind, 'ℹ')}  {text}  ",
                             font=ctk.CTkFont(size=13, weight="bold"),
                             text_color=fg)
        label.pack(padx=16, pady=10)
        Toast._active.append(toast)

        def remove():
            try:
                if toast.winfo_exists():
                    toast.destroy()
                    if toast in Toast._active:
                        Toast._active.remove(toast)
            except:
                pass

        parent.after(duration, remove)


# ═══════════════════════════════════════════════════════════
# MAIN APPLICATION
# ═══════════════════════════════════════════════════════════
class ShadowAdmin(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title(f"Shadow Mess — Admin Panel v{VERSION}")
        self.geometry("1200x780")
        self.minsize(1000, 650)
        self.configure(fg_color=T["bg"])

        try:
            self.iconbitmap(default="")
        except:
            pass

        self._users_data = []
        self._chats_data = []
        self._current_page = None
        self._pages = {}

        self._build_layout()
        self._navigate("dashboard")

    # ──────────────────────────────────────────────
    # LAYOUT
    # ──────────────────────────────────────────────
    def _build_layout(self):
        self._main_frame = ctk.CTkFrame(self, fg_color=T["bg"], corner_radius=0)
        self._main_frame.pack(fill="both", expand=True)

        # Sidebar
        self._sidebar = ctk.CTkFrame(self._main_frame, fg_color=T["bg_sidebar"],
                                     width=240, corner_radius=0,
                                     border_width=0)
        self._sidebar.pack(side="left", fill="y")
        self._sidebar.pack_propagate(False)
        self._build_sidebar()

        # Separator
        ctk.CTkFrame(self._main_frame, fg_color=T["border"], width=1, corner_radius=0
                     ).pack(side="left", fill="y")

        # Content
        self._content_outer = ctk.CTkFrame(self._main_frame, fg_color=T["bg"],
                                           corner_radius=0)
        self._content_outer.pack(side="left", fill="both", expand=True)

    def _build_sidebar(self):
        sb = self._sidebar

        # Logo
        logo = ctk.CTkFrame(sb, fg_color="transparent")
        logo.pack(fill="x", padx=20, pady=(20, 0))

        logo_icon = ctk.CTkFrame(logo, fg_color=T["accent"], width=36, height=36,
                                 corner_radius=10)
        logo_icon.pack(side="left")
        logo_icon.pack_propagate(False)
        ctk.CTkLabel(logo_icon, text="S", font=ctk.CTkFont(size=18, weight="bold"),
                     text_color="#fff").pack(expand=True)

        logo_text = ctk.CTkFrame(logo, fg_color="transparent")
        logo_text.pack(side="left", padx=(12, 0))
        ctk.CTkLabel(logo_text, text="Shadow Mess",
                     font=ctk.CTkFont(size=15, weight="bold"),
                     text_color=T["text"]).pack(anchor="w")
        ctk.CTkLabel(logo_text, text="Панель управления",
                     font=ctk.CTkFont(size=10),
                     text_color=T["text3"]).pack(anchor="w")

        # Nav section label
        ctk.CTkLabel(sb, text="НАВИГАЦИЯ",
                     font=ctk.CTkFont(size=10, weight="bold"),
                     text_color=T["text3"]).pack(anchor="w", padx=24, pady=(28, 8))

        # Nav items
        nav_items = [
            ("dashboard",  "📊", "Дашборд"),
            ("users",      "👥", "Пользователи"),
            ("chats",      "💬", "Чаты"),
            ("messages",   "📨", "Сообщения"),
            ("sessions",   "🔑", "Сессии"),
            ("push",       "🔔", "Push-подписки"),
        ]

        self._nav_btns = {}
        for page_id, icon, label in nav_items:
            btn = self._make_nav_btn(sb, icon, label, page_id)
            btn.pack(fill="x", padx=12, pady=1)
            self._nav_btns[page_id] = btn

        # Spacer
        ctk.CTkFrame(sb, fg_color="transparent").pack(fill="both", expand=True)

        # Danger zone
        ctk.CTkFrame(sb, fg_color=T["border"], height=1).pack(fill="x", padx=20, pady=(0, 8))

        ctk.CTkLabel(sb, text="ОПАСНАЯ ЗОНА",
                     font=ctk.CTkFont(size=10, weight="bold"),
                     text_color=T["red"]).pack(anchor="w", padx=24, pady=(0, 6))

        reset_btn = self._make_nav_btn(sb, "🔥", "Полный сброс", "reset", danger=True)
        reset_btn.pack(fill="x", padx=12, pady=1)

        # Footer
        footer = ctk.CTkFrame(sb, fg_color="transparent")
        footer.pack(fill="x", padx=20, pady=(12, 16))

        srv_name = SERVER.replace("https://", "").replace("http://", "")
        ctk.CTkLabel(footer, text="Сервер",
                     font=ctk.CTkFont(size=9),
                     text_color=T["text3"]).pack(anchor="w")
        self._srv_lbl = ctk.CTkLabel(footer, text=srv_name,
                                     font=ctk.CTkFont(family="Consolas", size=10),
                                     text_color=T["accent_light"], cursor="hand2")
        self._srv_lbl.pack(anchor="w", pady=(1, 0))
        self._srv_lbl.bind("<Button-1>", lambda e: webbrowser.open(SERVER))

        ctk.CTkLabel(footer, text=f"v{VERSION}",
                     font=ctk.CTkFont(size=9, weight="bold"),
                     text_color=T["text3"]).pack(anchor="w", pady=(4, 0))

    def _make_nav_btn(self, parent, icon, label, page_id, danger=False):
        frame = ctk.CTkFrame(parent, fg_color="transparent", corner_radius=8,
                             height=40, cursor="hand2")
        frame.pack_propagate(False)

        fg = T["red"] if danger else T["text2"]
        icon_lbl = ctk.CTkLabel(frame, text=icon, font=ctk.CTkFont(size=15),
                                text_color=fg, width=28)
        icon_lbl.pack(side="left", padx=(12, 0))
        text_lbl = ctk.CTkLabel(frame, text=label,
                                font=ctk.CTkFont(size=13),
                                text_color=fg, anchor="w")
        text_lbl.pack(side="left", padx=(8, 0), fill="x", expand=True)

        bar = ctk.CTkFrame(frame, width=3, fg_color=T["accent"], corner_radius=2)

        frame._icon_lbl = icon_lbl
        frame._text_lbl = text_lbl
        frame._bar = bar
        frame._page_id = page_id
        frame._danger = danger
        frame._active = False

        def on_enter(e):
            if not frame._active:
                frame.configure(fg_color=T["bg_hover"])

        def on_leave(e):
            if not frame._active:
                frame.configure(fg_color="transparent")

        def on_click(e):
            self._navigate(page_id)

        for w in [frame, icon_lbl, text_lbl]:
            w.bind("<Enter>", on_enter)
            w.bind("<Leave>", on_leave)
            w.bind("<Button-1>", on_click)

        return frame

    def _set_nav_active(self, page_id):
        for pid, btn in self._nav_btns.items():
            is_active = pid == page_id
            btn._active = is_active
            if is_active:
                btn.configure(fg_color=T["bg_selected"])
                btn._text_lbl.configure(text_color=T["accent_light"])
                btn._icon_lbl.configure(text_color=T["accent_light"])
                btn._bar.pack(side="left", fill="y", before=btn._icon_lbl, padx=(0, 0))
            else:
                btn.configure(fg_color="transparent")
                fg = T["red"] if btn._danger else T["text2"]
                btn._text_lbl.configure(text_color=fg)
                btn._icon_lbl.configure(text_color=fg)
                btn._bar.pack_forget()

    # ──────────────────────────────────────────────
    # NAVIGATION
    # ──────────────────────────────────────────────
    def _navigate(self, page_id):
        if page_id == "reset":
            self._do_full_reset()
            return

        if page_id == self._current_page:
            return
        self._current_page = page_id
        self._set_nav_active(page_id)
        self._show_page(page_id)

    def _show_page(self, page_id):
        for w in self._content_outer.winfo_children():
            w.destroy()

        pages = {
            "dashboard": self._page_dashboard,
            "users":     self._page_users,
            "chats":     self._page_chats,
            "messages":  self._page_messages,
            "sessions":  self._page_sessions,
            "push":      self._page_push,
        }
        builder = pages.get(page_id)
        if builder:
            builder()

    # ──────────────────────────────────────────────
    # HELPERS
    # ──────────────────────────────────────────────
    def _make_scrollable(self):
        scroll = ctk.CTkScrollableFrame(self._content_outer, fg_color=T["bg"],
                                        corner_radius=0)
        scroll.pack(fill="both", expand=True)
        return scroll

    def _page_header(self, parent, icon, title, subtitle=""):
        header = ctk.CTkFrame(parent, fg_color="transparent")
        header.pack(fill="x", padx=32, pady=(28, 0))

        top_row = ctk.CTkFrame(header, fg_color="transparent")
        top_row.pack(fill="x")
        ctk.CTkLabel(top_row, text=f"{icon}  {title}",
                     font=ctk.CTkFont(size=22, weight="bold"),
                     text_color=T["text"]).pack(side="left")

        if subtitle:
            ctk.CTkLabel(header, text=subtitle,
                         font=ctk.CTkFont(size=12),
                         text_color=T["text2"]).pack(anchor="w", pady=(4, 0))
        return top_row

    def _separator(self, parent):
        ctk.CTkFrame(parent, fg_color=T["border"], height=1).pack(
            fill="x", padx=32, pady=(14, 16))

    def _loading_screen(self, parent, text="Загрузка..."):
        f = ctk.CTkFrame(parent, fg_color="transparent")
        f.pack(fill="both", expand=True, pady=120)
        ctk.CTkLabel(f, text="◌",
                     font=ctk.CTkFont(size=44),
                     text_color=T["accent"]).pack()
        ctk.CTkLabel(f, text=text,
                     font=ctk.CTkFont(size=13),
                     text_color=T["text2"]).pack(pady=(10, 0))
        return f

    def _threaded(self, func, callback=None, error_callback=None):
        def run():
            try:
                result = func()
                if callback:
                    self.after(0, lambda: callback(result))
            except Exception as e:
                if error_callback:
                    self.after(0, lambda: error_callback(str(e)))
                else:
                    self.after(0, lambda: Toast.show(self, f"Ошибка: {e}", "error"))
        threading.Thread(target=run, daemon=True).start()

    def _confirm(self, title, message):
        return messagebox.askyesno(title, message)

    def _action_btn(self, parent, text, command, color=None, hover=None, width=140, height=34):
        color = color or T["accent"]
        hover = hover or T["accent_dim"]
        return ctk.CTkButton(parent, text=text, command=command,
                             fg_color=color, hover_color=hover,
                             corner_radius=8, height=height, width=width,
                             font=ctk.CTkFont(size=12, weight="bold"))

    # ══════════════════════════════════════════════
    # PAGE: DASHBOARD
    # ══════════════════════════════════════════════
    def _page_dashboard(self):
        content = self._make_scrollable()
        loading = self._loading_screen(content)

        def on_data(stats):
            loading.destroy()
            self._render_dashboard(content, stats)

        self._threaded(lambda: api("GET", "/api/admin/stats"), on_data)

    def _render_dashboard(self, content, stats):
        top_row = self._page_header(content, "📊", "Дашборд", "Обзор базы данных")
        self._action_btn(top_row, "↻ Обновить",
                         lambda: (setattr(self, '_current_page', None), self._navigate("dashboard")),
                         T["bg_card2"], T["bg_hover"], 120).pack(side="right")
        self._separator(content)

        # Stat cards grid
        grid = ctk.CTkFrame(content, fg_color="transparent")
        grid.pack(fill="x", padx=32)

        cards = [
            ("👥", "Пользователи", stats.get("users", 0),    T["accent"]),
            ("💬", "Чаты",         stats.get("chats", 0),    T["green"]),
            ("📨", "Сообщения",    stats.get("messages", 0), T["yellow"]),
            ("🔑", "Сессии",       stats.get("sessions", 0), T["blue"]),
            ("🔔", "Push",         stats.get("pushSubs", 0), T["cyan"]),
        ]

        for i, (icon, label, value, color) in enumerate(cards):
            card = self._stat_card(grid, icon, label, value, color)
            col = i % 3
            row = i // 3
            card.grid(row=row, column=col, padx=6, pady=6, sticky="nsew")

        for c in range(3):
            grid.columnconfigure(c, weight=1)

        # Quick actions
        ctk.CTkLabel(content, text="Быстрые действия",
                     font=ctk.CTkFont(size=14, weight="bold"),
                     text_color=T["text"]).pack(anchor="w", padx=32, pady=(24, 10))

        actions_frame = ctk.CTkFrame(content, fg_color="transparent")
        actions_frame.pack(fill="x", padx=32)

        quick_actions = [
            ("👥 Пользователи", lambda: self._navigate("users"), T["accent"]),
            ("💬 Чаты",         lambda: self._navigate("chats"), T["green"]),
            ("🌐 Открыть сайт", lambda: webbrowser.open(SERVER), T["blue"]),
        ]
        for text, cmd, color in quick_actions:
            self._action_btn(actions_frame, text, cmd, color,
                            width=180, height=38).pack(side="left", padx=(0, 8))

    def _stat_card(self, parent, icon, label, value, color):
        card = ctk.CTkFrame(parent, fg_color=T["bg_card"], corner_radius=14,
                            border_width=1, border_color=T["border"])

        # Top accent bar
        ctk.CTkFrame(card, fg_color=color, height=3,
                     corner_radius=2).pack(fill="x", padx=14, pady=(10, 0))

        inner = ctk.CTkFrame(card, fg_color="transparent")
        inner.pack(fill="both", expand=True, padx=18, pady=(10, 16))

        # Icon + label row
        top = ctk.CTkFrame(inner, fg_color="transparent")
        top.pack(fill="x")
        ctk.CTkLabel(top, text=icon, font=ctk.CTkFont(size=18),
                     text_color=color).pack(side="left")
        ctk.CTkLabel(top, text=f"  {label}", font=ctk.CTkFont(size=11),
                     text_color=T["text2"]).pack(side="left")

        # Value
        ctk.CTkLabel(inner, text=str(value),
                     font=ctk.CTkFont(size=34, weight="bold"),
                     text_color=color).pack(anchor="w", pady=(6, 0))

        # Hover effect
        def enter(e):
            card.configure(border_color=color)
        def leave(e):
            card.configure(border_color=T["border"])
        card.bind("<Enter>", enter)
        card.bind("<Leave>", leave)
        for w in card.winfo_children():
            w.bind("<Enter>", enter)
            w.bind("<Leave>", leave)

        return card

    # ══════════════════════════════════════════════
    # PAGE: USERS
    # ══════════════════════════════════════════════
    def _page_users(self):
        content = self._make_scrollable()
        loading = self._loading_screen(content)

        def on_data(users):
            loading.destroy()
            self._users_data = users
            self._render_users(content, users)

        self._threaded(lambda: api("GET", "/api/admin/users"), on_data)

    def _render_users(self, content, users):
        top_row = self._page_header(content, "👥", "Пользователи",
                                    f"Всего: {len(users)}")

        btn_frame = ctk.CTkFrame(top_row, fg_color="transparent")
        btn_frame.pack(side="right")
        self._action_btn(btn_frame, "↻ Обновить",
                         lambda: (setattr(self, '_current_page', None), self._navigate("users")),
                         T["bg_card2"], T["bg_hover"], 110).pack(side="left", padx=(0, 6))
        self._action_btn(btn_frame, "⚠ Удалить всех", self._del_all_users,
                         T["red_dim"], "#7f1d1d", 140).pack(side="left")

        self._separator(content)

        # Search
        search_frame = ctk.CTkFrame(content, fg_color="transparent")
        search_frame.pack(fill="x", padx=32, pady=(0, 12))

        self._user_search = ctk.StringVar()
        self._user_search.trace_add("write", lambda *_: self._filter_users())

        ctk.CTkEntry(search_frame, placeholder_text="🔍  Поиск по имени или username...",
                     textvariable=self._user_search,
                     fg_color=T["bg_input"], border_color=T["border"],
                     text_color=T["text"], corner_radius=10,
                     height=38, font=ctk.CTkFont(size=13)).pack(fill="x")

        # Users list container
        self._users_container = ctk.CTkFrame(content, fg_color="transparent")
        self._users_container.pack(fill="both", expand=True, padx=32, pady=(0, 20))

        self._render_user_list(users)

    def _render_user_list(self, users):
        for w in self._users_container.winfo_children():
            w.destroy()

        if not users:
            ctk.CTkLabel(self._users_container, text="Нет пользователей",
                         font=ctk.CTkFont(size=14), text_color=T["text3"]).pack(pady=40)
            return

        # Table header
        header = ctk.CTkFrame(self._users_container, fg_color=T["bg_header"],
                              corner_radius=10, height=38)
        header.pack(fill="x", pady=(0, 4))
        header.pack_propagate(False)

        columns = [
            ("Пользователь", 0.28),
            ("Регистрация", 0.18),
            ("Последний визит", 0.20),
            ("Bio", 0.18),
            ("Действия", 0.16),
        ]
        x = 0.02
        for text, width in columns:
            ctk.CTkLabel(header, text=text,
                         font=ctk.CTkFont(size=11, weight="bold"),
                         text_color=T["text3"]).place(relx=x, rely=0.5, anchor="w")
            x += width

        # User rows
        for i, user in enumerate(users):
            self._user_row(user, i)

    def _user_row(self, user, index):
        row = ctk.CTkFrame(self._users_container, fg_color=T["bg_card"],
                           corner_radius=8, height=52)
        row.pack(fill="x", pady=2)
        row.pack_propagate(False)

        # Avatar
        av_color = user.get("avatarColor", T["accent"])
        name = user.get("displayName", "?") or "?"
        initials = "".join(w[0] for w in name.split()[:2]).upper()[:2]

        av = ctk.CTkFrame(row, fg_color=av_color, width=32, height=32, corner_radius=16)
        av.place(relx=0.02, rely=0.5, anchor="w")
        av.pack_propagate(False)
        ctk.CTkLabel(av, text=initials, font=ctk.CTkFont(size=11, weight="bold"),
                     text_color="#fff").pack(expand=True)

        # Name + username
        name_frame = ctk.CTkFrame(row, fg_color="transparent")
        name_frame.place(relx=0.07, rely=0.5, anchor="w")
        name_label = "⭐ " + name if user.get("superUser") else name
        ctk.CTkLabel(name_frame, text=name_label,
                     font=ctk.CTkFont(size=12, weight="bold"),
                     text_color=T["text"]).pack(anchor="w")
        ctk.CTkLabel(name_frame, text=f"@{user.get('username', '?')}",
                     font=ctk.CTkFont(size=10),
                     text_color=T["text2"]).pack(anchor="w")

        # Registration date
        ctk.CTkLabel(row, text=fmt_date(user.get("createdAt")),
                     font=ctk.CTkFont(size=11),
                     text_color=T["text2"]).place(relx=0.30, rely=0.5, anchor="w")

        # Last seen
        ctk.CTkLabel(row, text=fmt_date(user.get("lastSeen")),
                     font=ctk.CTkFont(size=11),
                     text_color=T["text2"]).place(relx=0.48, rely=0.5, anchor="w")

        # Bio
        bio = (user.get("bio") or "—")[:30]
        ctk.CTkLabel(row, text=bio, font=ctk.CTkFont(size=11),
                     text_color=T["text3"]).place(relx=0.68, rely=0.5, anchor="w")

        # Info button
        info_btn = ctk.CTkButton(row, text="ℹ", width=32, height=28,
                                 fg_color=T["bg_card2"], hover_color=T["accent_dim"],
                                 corner_radius=6, font=ctk.CTkFont(size=14),
                                 command=lambda u=user: self._user_detail(u))
        info_btn.place(relx=0.85, rely=0.5, anchor="w")

        # Delete button
        del_btn = ctk.CTkButton(row, text="🗑", width=32, height=28,
                                fg_color=T["bg_card2"], hover_color=T["red_dim"],
                                corner_radius=6, font=ctk.CTkFont(size=14),
                                command=lambda u=user: self._del_user(u))
        del_btn.place(relx=0.90, rely=0.5, anchor="w")

        # Hover effect
        def enter(e):
            row.configure(fg_color=T["bg_hover"])
        def leave(e):
            row.configure(fg_color=T["bg_card"])
        for w in [row, name_frame, av]:
            w.bind("<Enter>", enter)
            w.bind("<Leave>", leave)
        row.bind("<Double-1>", lambda e, u=user: self._user_detail(u))

    def _filter_users(self):
        q = self._user_search.get().lower().strip()
        if not q:
            self._render_user_list(self._users_data)
        else:
            filtered = [u for u in self._users_data
                        if q in (u.get("username", "").lower())
                        or q in (u.get("displayName", "").lower())]
            self._render_user_list(filtered)

    def _del_user(self, user):
        name = f"@{user.get('username', '?')}"
        uid = user.get("_id") or user.get("id")
        if not self._confirm("Удаление", f"Удалить {name} и все его данные?"):
            return

        def on_done(r):
            Toast.show(self, f"Удалён: {name}", "success")
            self._current_page = None
            self._navigate("users")

        self._threaded(lambda: api("DELETE", f"/api/admin/users/{uid}"), on_done)

    def _del_all_users(self):
        if not self._confirm("⚠ Удаление всех", "Удалить ВСЕХ пользователей?\nДействие необратимо!"):
            return

        def on_done(r):
            Toast.show(self, f"Удалено: {r.get('deleted', 0)} пользователей", "success")
            self._current_page = None
            self._navigate("users")

        self._threaded(lambda: api("DELETE", "/api/admin/users"), on_done)

    def _user_detail(self, user):
        """User detail popup window."""
        win = ctk.CTkToplevel(self)
        win.title(f"Профиль — {user.get('displayName', '?')}")
        win.geometry("440x620")
        win.configure(fg_color=T["bg"])
        win.resizable(False, False)
        win.transient(self)
        win.grab_set()
        win.focus()

        # Center
        self.update_idletasks()
        px = self.winfo_x() + (self.winfo_width() - 440) // 2
        py = self.winfo_y() + (self.winfo_height() - 620) // 2
        win.geometry(f"+{px}+{py}")

        # Profile card
        card = ctk.CTkFrame(win, fg_color=T["bg_card"], corner_radius=16,
                            border_width=1, border_color=T["border"])
        card.pack(fill="x", padx=20, pady=(20, 0))

        # Avatar
        av_color = user.get("avatarColor", T["accent"])
        name = user.get("displayName", "?") or "?"
        initials = "".join(w[0] for w in name.split()[:2]).upper()[:2]

        av = ctk.CTkFrame(card, fg_color=av_color, width=72, height=72, corner_radius=36)
        av.pack(pady=(24, 10))
        av.pack_propagate(False)
        ctk.CTkLabel(av, text=initials, font=ctk.CTkFont(size=22, weight="bold"),
                     text_color="#fff").pack(expand=True)

        ctk.CTkLabel(card, text=name,
                     font=ctk.CTkFont(size=18, weight="bold"),
                     text_color=T["text"]).pack()
        ctk.CTkLabel(card, text=f"@{user.get('username', '?')}",
                     font=ctk.CTkFont(size=12),
                     text_color=T["accent_light"]).pack(pady=(2, 16))

        # Fields
        detail = ctk.CTkFrame(win, fg_color=T["bg_card"], corner_radius=16,
                              border_width=1, border_color=T["border"])
        detail.pack(fill="x", padx=20, pady=(10, 0))

        uid = user.get("_id") or user.get("id", "?")
        fields = [
            ("ID",             uid[:32]),
            ("Bio",            (user.get("bio") or "—")[:60]),
            ("Супер-юзер",     "⭐ Да" if user.get("superUser") else "Нет"),
            ("Аватар",         "✅ Загружен" if user.get("avatar") else "❌ Нет"),
            ("Регистрация",    fmt_date(user.get("createdAt"))),
            ("Последний вход", fmt_date(user.get("lastSeen"))),
        ]

        for label, value in fields:
            r = ctk.CTkFrame(detail, fg_color="transparent")
            r.pack(fill="x", padx=18, pady=4)
            ctk.CTkLabel(r, text=f"{label}:",
                         font=ctk.CTkFont(size=11, weight="bold"),
                         text_color=T["text2"], width=110, anchor="w").pack(side="left")
            ctk.CTkLabel(r, text=str(value),
                         font=ctk.CTkFont(size=11),
                         text_color=T["text"], anchor="w").pack(side="left", fill="x", expand=True)

        ctk.CTkFrame(detail, fg_color="transparent", height=8).pack()

        # Super User toggle button
        is_super = user.get("superUser", False)
        super_text = "⭐ Убрать супер-пользователя" if is_super else "⭐ Выдать супер-пользователя"
        super_color = T["red"] if is_super else T["accent"]
        super_hover = T["red_dim"] if is_super else T["accent_dim"]

        def toggle_super(u=user, w=None):
            uid = u.get("_id") or u.get("id")
            def on_done(r):
                new_status = r.get("superUser", False)
                status_text = "выдан" if new_status else "убран"
                Toast.show(self, f"Супер-пользователь {status_text}: @{u.get('username', '?')}", "success")
                win.destroy()
                self._current_page = None
                self._navigate("users")
            self._threaded(lambda: api("PUT", f"/api/admin/users/{uid}/superuser"), on_done)

        super_btn = ctk.CTkButton(win, text=super_text,
                       command=toggle_super,
                       fg_color=super_color, hover_color=super_hover,
                       corner_radius=10, height=40, width=400,
                       font=ctk.CTkFont(size=13, weight="bold"))
        super_btn.pack(padx=20, pady=(14, 0))

        # Delete button
        ctk.CTkButton(win, text="🗑  Удалить пользователя",
                       command=lambda: (win.destroy(), self._del_user(user)),
                       fg_color=T["red"], hover_color=T["red_dim"],
                       corner_radius=10, height=40, width=400,
                       font=ctk.CTkFont(size=13, weight="bold")).pack(padx=20, pady=(10, 10))

        # Close button
        ctk.CTkButton(win, text="Закрыть",
                       command=win.destroy,
                       fg_color=T["bg_card2"], hover_color=T["bg_hover"],
                       corner_radius=10, height=36, width=400,
                       font=ctk.CTkFont(size=12)).pack(padx=20, pady=(0, 16))

    # ══════════════════════════════════════════════
    # PAGE: CHATS
    # ══════════════════════════════════════════════
    def _page_chats(self):
        content = self._make_scrollable()
        loading = self._loading_screen(content)

        def on_data(data):
            loading.destroy()
            stats, users = data
            self._render_chats_page(content, stats, users)

        self._threaded(
            lambda: (api("GET", "/api/admin/stats"), api("GET", "/api/admin/users")),
            on_data
        )

    def _render_chats_page(self, content, stats, users):
        top_row = self._page_header(content, "💬", "Чаты",
                                    f"Всего: {stats.get('chats', 0)}, Сообщений: {stats.get('messages', 0)}")

        btn_frame = ctk.CTkFrame(top_row, fg_color="transparent")
        btn_frame.pack(side="right")
        self._action_btn(btn_frame, "↻ Обновить",
                         lambda: (setattr(self, '_current_page', None), self._navigate("chats")),
                         T["bg_card2"], T["bg_hover"], 110).pack(side="left", padx=(0, 6))

        self._separator(content)

        # Info cards
        grid = ctk.CTkFrame(content, fg_color="transparent")
        grid.pack(fill="x", padx=32)

        items = [
            ("💬", "Чатов", stats.get("chats", 0), T["green"]),
            ("📨", "Сообщений", stats.get("messages", 0), T["yellow"]),
            ("👥", "Пользователей", stats.get("users", 0), T["accent"]),
        ]
        for i, (icon, label, val, color) in enumerate(items):
            c = self._stat_card(grid, icon, label, val, color)
            c.grid(row=0, column=i, padx=6, pady=6, sticky="nsew")
        for c in range(3):
            grid.columnconfigure(c, weight=1)

        # Danger actions
        ctk.CTkLabel(content, text="Управление данными",
                     font=ctk.CTkFont(size=14, weight="bold"),
                     text_color=T["text"]).pack(anchor="w", padx=32, pady=(24, 10))

        actions = ctk.CTkFrame(content, fg_color="transparent")
        actions.pack(fill="x", padx=32)

        # Delete all messages card
        msg_card = ctk.CTkFrame(actions, fg_color=T["bg_card"], corner_radius=12,
                                border_width=1, border_color=T["border"])
        msg_card.pack(fill="x", pady=4)
        msg_inner = ctk.CTkFrame(msg_card, fg_color="transparent")
        msg_inner.pack(fill="x", padx=18, pady=14)
        ctk.CTkLabel(msg_inner, text="📨 Удалить все сообщения",
                     font=ctk.CTkFont(size=13, weight="bold"),
                     text_color=T["text"]).pack(side="left")
        ctk.CTkLabel(msg_inner, text="Удалит сообщения из всех чатов",
                     font=ctk.CTkFont(size=11),
                     text_color=T["text3"]).pack(side="left", padx=(12, 0))
        self._action_btn(msg_inner, "Удалить", self._del_msgs,
                         T["red"], T["red_dim"], 100, 30).pack(side="right")

        # Delete all chats card
        chat_card = ctk.CTkFrame(actions, fg_color=T["bg_card"], corner_radius=12,
                                 border_width=1, border_color=T["border"])
        chat_card.pack(fill="x", pady=4)
        chat_inner = ctk.CTkFrame(chat_card, fg_color="transparent")
        chat_inner.pack(fill="x", padx=18, pady=14)
        ctk.CTkLabel(chat_inner, text="💬 Удалить все чаты",
                     font=ctk.CTkFont(size=13, weight="bold"),
                     text_color=T["text"]).pack(side="left")
        ctk.CTkLabel(chat_inner, text="Удалит чаты и все сообщения",
                     font=ctk.CTkFont(size=11),
                     text_color=T["text3"]).pack(side="left", padx=(12, 0))
        self._action_btn(chat_inner, "Удалить", self._del_chats,
                         T["red"], T["red_dim"], 100, 30).pack(side="right")

    # ══════════════════════════════════════════════
    # PAGE: MESSAGES
    # ══════════════════════════════════════════════
    def _page_messages(self):
        content = self._make_scrollable()
        loading = self._loading_screen(content)

        def on_data(stats):
            loading.destroy()
            self._render_messages_page(content, stats)

        self._threaded(lambda: api("GET", "/api/admin/stats"), on_data)

    def _render_messages_page(self, content, stats):
        top_row = self._page_header(content, "📨", "Сообщения",
                                    f"Всего: {stats.get('messages', 0)}")

        self._action_btn(top_row, "↻ Обновить",
                         lambda: (setattr(self, '_current_page', None), self._navigate("messages")),
                         T["bg_card2"], T["bg_hover"], 110).pack(side="right")

        self._separator(content)

        # Stats
        grid = ctk.CTkFrame(content, fg_color="transparent")
        grid.pack(fill="x", padx=32)

        msg_card = self._stat_card(grid, "📨", "Сообщений", stats.get("messages", 0), T["yellow"])
        msg_card.grid(row=0, column=0, padx=6, pady=6, sticky="nsew")
        chat_card = self._stat_card(grid, "💬", "В чатах", stats.get("chats", 0), T["green"])
        chat_card.grid(row=0, column=1, padx=6, pady=6, sticky="nsew")

        grid.columnconfigure(0, weight=1)
        grid.columnconfigure(1, weight=1)

        # Action card
        action_card = ctk.CTkFrame(content, fg_color=T["bg_card"], corner_radius=14,
                                   border_width=1, border_color=T["border"])
        action_card.pack(fill="x", padx=32, pady=(20, 0))

        inner = ctk.CTkFrame(action_card, fg_color="transparent")
        inner.pack(fill="x", padx=24, pady=24)

        ctk.CTkLabel(inner, text="⚠  Удаление всех сообщений",
                     font=ctk.CTkFont(size=15, weight="bold"),
                     text_color=T["red"]).pack(anchor="w")
        ctk.CTkLabel(inner, text="Это действие удалит ВСЕ сообщения из ВСЕХ чатов.\nВосстановление невозможно.",
                     font=ctk.CTkFont(size=12),
                     text_color=T["text2"], justify="left").pack(anchor="w", pady=(8, 16))

        self._action_btn(inner, "🗑  Удалить все сообщения", self._del_msgs,
                         T["red"], T["red_dim"], 240, 38).pack(anchor="w")

    def _del_msgs(self):
        if not self._confirm("Подтверждение", "Удалить ВСЕ сообщения?"):
            return

        def on_done(r):
            Toast.show(self, f"Удалено: {r.get('deleted', 0)} сообщений", "success")
            self._current_page = None
            if self._current_page in ("messages", "chats"):
                self._navigate(self._current_page)
            else:
                self._navigate("messages")

        self._threaded(lambda: api("DELETE", "/api/admin/messages"), on_done)

    def _del_chats(self):
        if not self._confirm("Подтверждение", "Удалить ВСЕ чаты и сообщения?"):
            return

        def on_done(r):
            Toast.show(self, f"Удалено: {r.get('deletedChats', 0)} чатов, {r.get('deletedMessages', 0)} сообщений", "success")
            self._current_page = None
            self._navigate("chats")

        self._threaded(lambda: api("DELETE", "/api/admin/chats"), on_done)

    # ══════════════════════════════════════════════
    # PAGE: SESSIONS
    # ══════════════════════════════════════════════
    def _page_sessions(self):
        content = self._make_scrollable()
        loading = self._loading_screen(content)

        def on_data(stats):
            loading.destroy()
            self._render_sessions(content, stats)

        self._threaded(lambda: api("GET", "/api/admin/stats"), on_data)

    def _render_sessions(self, content, stats):
        top_row = self._page_header(content, "🔑", "Сессии",
                                    f"Всего: {stats.get('sessions', 0)}")
        self._action_btn(top_row, "↻ Обновить",
                         lambda: (setattr(self, '_current_page', None), self._navigate("sessions")),
                         T["bg_card2"], T["bg_hover"], 110).pack(side="right")
        self._separator(content)

        card = self._stat_card(
            content, "🔑", "Активных сессий", stats.get("sessions", 0), T["blue"])
        card.pack(fill="x", padx=32, pady=(0, 16))

        # Action
        action_card = ctk.CTkFrame(content, fg_color=T["bg_card"], corner_radius=14,
                                   border_width=1, border_color=T["border"])
        action_card.pack(fill="x", padx=32)

        inner = ctk.CTkFrame(action_card, fg_color="transparent")
        inner.pack(fill="x", padx=24, pady=24)

        ctk.CTkLabel(inner, text="🧹  Очистка неактивных сессий",
                     font=ctk.CTkFont(size=15, weight="bold"),
                     text_color=T["blue"]).pack(anchor="w")
        ctk.CTkLabel(inner, text="Удалит истёкшие и неактивные сессии для оптимизации.\nРекомендуется выполнять периодически.",
                     font=ctk.CTkFont(size=12),
                     text_color=T["text2"], justify="left").pack(anchor="w", pady=(8, 16))

        self._action_btn(inner, "🧹  Очистить сессии", self._del_sessions,
                         T["blue"], "#1e40af", 200, 38).pack(anchor="w")

    def _del_sessions(self):
        if not self._confirm("Подтверждение", "Очистить неактивные сессии?"):
            return

        def on_done(r):
            Toast.show(self, f"Удалено: {r.get('deleted', 0)} сессий", "success")
            self._current_page = None
            self._navigate("sessions")

        self._threaded(lambda: api("DELETE", "/api/admin/sessions"), on_done)

    # ══════════════════════════════════════════════
    # PAGE: PUSH
    # ══════════════════════════════════════════════
    def _page_push(self):
        content = self._make_scrollable()
        loading = self._loading_screen(content)

        def on_data(stats):
            loading.destroy()
            self._render_push(content, stats)

        self._threaded(lambda: api("GET", "/api/admin/stats"), on_data)

    def _render_push(self, content, stats):
        top_row = self._page_header(content, "🔔", "Push-подписки",
                                    f"Всего: {stats.get('pushSubs', 0)}")
        self._action_btn(top_row, "↻ Обновить",
                         lambda: (setattr(self, '_current_page', None), self._navigate("push")),
                         T["bg_card2"], T["bg_hover"], 110).pack(side="right")
        self._separator(content)

        card = self._stat_card(
            content, "🔔", "Push-подписок", stats.get("pushSubs", 0), T["cyan"])
        card.pack(fill="x", padx=32, pady=(0, 16))

        # Action
        action_card = ctk.CTkFrame(content, fg_color=T["bg_card"], corner_radius=14,
                                   border_width=1, border_color=T["border"])
        action_card.pack(fill="x", padx=32)

        inner = ctk.CTkFrame(action_card, fg_color="transparent")
        inner.pack(fill="x", padx=24, pady=24)

        ctk.CTkLabel(inner, text="🧹  Очистка push-подписок",
                     font=ctk.CTkFont(size=15, weight="bold"),
                     text_color=T["cyan"]).pack(anchor="w")
        ctk.CTkLabel(inner, text="Удалит ВСЕ push-подписки.\nПользователям нужно будет заново разрешить уведомления.",
                     font=ctk.CTkFont(size=12),
                     text_color=T["text2"], justify="left").pack(anchor="w", pady=(8, 16))

        self._action_btn(inner, "🧹  Очистить подписки", self._del_push,
                         T["cyan"], "#0e7490", 200, 38).pack(anchor="w")

    def _del_push(self):
        if not self._confirm("Подтверждение", "Очистить все push-подписки?"):
            return

        def on_done(r):
            Toast.show(self, f"Удалено: {r.get('deleted', 0)} подписок", "success")
            self._current_page = None
            self._navigate("push")

        self._threaded(lambda: api("DELETE", "/api/admin/pushsubs"), on_done)

    # ══════════════════════════════════════════════
    # FULL RESET
    # ══════════════════════════════════════════════
    def _do_full_reset(self):
        if not self._confirm("⚠ ПОЛНЫЙ СБРОС",
            "ЭТО УДАЛИТ ВСЮ БАЗУ ДАННЫХ!\n\n"
            "• Всех пользователей\n• Все чаты\n• Все сообщения\n"
            "• Все сессии\n• Все push-подписки\n\nПродолжить?"):
            return
        if not self._confirm("Последнее предупреждение",
            "Вы ТОЧНО уверены? Это НЕЛЬЗЯ отменить!"):
            return

        def on_done(r):
            msg = (f"Удалено:\n"
                   f"  Пользователей: {r.get('deletedUsers', 0)}\n"
                   f"  Чатов: {r.get('deletedChats', 0)}\n"
                   f"  Сообщений: {r.get('deletedMessages', 0)}\n"
                   f"  Сессий: {r.get('deletedSessions', 0)}\n"
                   f"  Push: {r.get('deletedPushSubs', 0)}")
            Toast.show(self, "База данных полностью очищена", "warning", 5000)
            messagebox.showinfo("Сброс выполнен", msg)
            self._current_page = None
            self._navigate("dashboard")

        self._threaded(lambda: api("DELETE", "/api/admin/reset"), on_done)


# ═══════════════════════════════════════════════════════════
# CONNECTION DIALOG
# ═══════════════════════════════════════════════════════════
class ConnectionDialog(ctk.CTk):
    """Modern connection dialog."""
    def __init__(self):
        super().__init__()
        self.title("Shadow Mess — Подключение")
        self.geometry("420x300")
        self.resizable(False, False)
        self.configure(fg_color=T["bg"])
        self.result = None

        # Center
        self.update_idletasks()
        x = (self.winfo_screenwidth() - 420) // 2
        y = (self.winfo_screenheight() - 300) // 2
        self.geometry(f"+{x}+{y}")

        # Logo
        logo = ctk.CTkFrame(self, fg_color=T["accent"], width=48, height=48,
                            corner_radius=14)
        logo.pack(pady=(30, 0))
        logo.pack_propagate(False)
        ctk.CTkLabel(logo, text="S", font=ctk.CTkFont(size=22, weight="bold"),
                     text_color="#fff").pack(expand=True)

        ctk.CTkLabel(self, text="Shadow Mess",
                     font=ctk.CTkFont(size=20, weight="bold"),
                     text_color=T["text"]).pack(pady=(10, 2))
        ctk.CTkLabel(self, text="Панель администратора",
                     font=ctk.CTkFont(size=12),
                     text_color=T["text2"]).pack()

        # Server URL input
        ctk.CTkLabel(self, text="URL сервера:",
                     font=ctk.CTkFont(size=11),
                     text_color=T["text2"]).pack(anchor="w", padx=40, pady=(20, 4))

        self._url_var = ctk.StringVar(value=DEFAULT_SERVER)
        entry = ctk.CTkEntry(self, textvariable=self._url_var,
                             fg_color=T["bg_input"], border_color=T["border"],
                             text_color=T["text"], corner_radius=10,
                             height=40, width=340,
                             font=ctk.CTkFont(family="Consolas", size=12))
        entry.pack(padx=40)
        entry.bind("<Return>", lambda e: self._connect())

        # Connect button
        ctk.CTkButton(self, text="Подключиться →", command=self._connect,
                      fg_color=T["accent"], hover_color=T["accent_dim"],
                      corner_radius=10, height=40, width=340,
                      font=ctk.CTkFont(size=14, weight="bold")).pack(padx=40, pady=(14, 0))

    def _connect(self):
        self.result = self._url_var.get().strip().rstrip("/") or DEFAULT_SERVER
        self.destroy()


# ═══════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════
def main():
    global SERVER

    # Connection dialog
    dialog = ConnectionDialog()
    dialog.mainloop()

    if not dialog.result:
        return

    SERVER = dialog.result

    # Main app
    app = ShadowAdmin()
    app.update_idletasks()
    w, h = 1200, 780
    x = (app.winfo_screenwidth() - w) // 2
    y = (app.winfo_screenheight() - h) // 2
    app.geometry(f"{w}x{h}+{x}+{y}")
    app.mainloop()


if __name__ == "__main__":
    main()

