#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Shadow Mess — Красивая панель управления (tkinter GUI)
Тёмная тема, скруглённые углы, современный дизайн
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
    "bg":           "#0d0d1a",
    "bg_card":      "#161625",
    "bg_sidebar":   "#101020",
    "bg_hover":     "#1c1c35",
    "bg_input":     "#1a1a2e",
    "accent":       "#7c6cf7",
    "accent_hover": "#9488ff",
    "accent_dim":   "#2a2250",
    "success":      "#22c55e",
    "success_dim":  "#0d3320",
    "danger":       "#ef4444",
    "danger_hover": "#dc2626",
    "danger_dim":   "#3b1111",
    "warning":      "#f59e0b",
    "warning_dim":  "#3b2d0a",
    "text":         "#eaeaf4",
    "text_sec":     "#8888aa",
    "text_dim":     "#555570",
    "border":       "#252540",
    "border_light": "#323250",
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
# ROUNDED RECTANGLES HELPER
# ═══════════════════════════════════════════════════════════
def round_rect(canvas, x1, y1, x2, y2, radius=16, **kwargs):
    """Draw a rounded rectangle on a canvas."""
    r = radius
    points = [
        x1+r, y1,  x2-r, y1,  x2, y1,  x2, y1+r,
        x2, y2-r,  x2, y2,  x2-r, y2,  x1+r, y2,
        x1, y2,  x1, y2-r,  x1, y1+r,  x1, y1,
    ]
    return canvas.create_polygon(points, smooth=True, **kwargs)


class RoundedFrame(tk.Canvas):
    """A frame with rounded corners using Canvas."""
    def __init__(self, parent, bg_color=None, border_color=None, radius=14, padx=0, pady=0, **kwargs):
        bg_color = bg_color or COLORS["bg_card"]
        self._bg_color = bg_color
        self._border_color = border_color or COLORS["border"]
        self._radius = radius
        self._inner_padx = padx
        self._inner_pady = pady
        parent_bg = COLORS["bg"]
        try:
            parent_bg = parent.cget("bg")
        except:
            pass
        super().__init__(parent, bg=parent_bg, highlightthickness=0, **kwargs)
        self.bind("<Configure>", self._redraw)

    def _redraw(self, event=None):
        self.delete("bg_rect")
        w = self.winfo_width()
        h = self.winfo_height()
        if w > 1 and h > 1:
            round_rect(self, 1, 1, w-1, h-1, radius=self._radius,
                       fill=self._bg_color, outline=self._border_color, width=1, tags="bg_rect")
            self.tag_lower("bg_rect")


# ═══════════════════════════════════════════════════════════
# ГЛАВНЫЙ КЛАСС ПРИЛОЖЕНИЯ
# ═══════════════════════════════════════════════════════════
class ShadowAdminApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Shadow Mess — Админ-панель")
        self.geometry("1050x700")
        self.minsize(850, 550)
        self.configure(bg=COLORS["bg"])

        try:
            self.iconbitmap(default="")
        except:
            pass

        # Стили ttk
        self.style = ttk.Style(self)
        self.style.theme_use("clam")
        self._configure_styles()

        # Шрифты
        self.font_title   = tkfont.Font(family="Segoe UI", size=20, weight="bold")
        self.font_header  = tkfont.Font(family="Segoe UI", size=13, weight="bold")
        self.font_normal  = tkfont.Font(family="Segoe UI", size=11)
        self.font_small   = tkfont.Font(family="Segoe UI", size=10)
        self.font_tiny    = tkfont.Font(family="Segoe UI", size=9)
        self.font_mono    = tkfont.Font(family="Consolas", size=10)

        self._build_ui()
        self._show_dashboard()

    def _configure_styles(self):
        s = self.style

        s.configure("Dark.Treeview",
            background=COLORS["bg_card"],
            foreground=COLORS["text"],
            fieldbackground=COLORS["bg_card"],
            borderwidth=0,
            rowheight=40,
            font=("Segoe UI", 10)
        )
        s.configure("Dark.Treeview.Heading",
            background=COLORS["bg_sidebar"],
            foreground=COLORS["text_sec"],
            borderwidth=0,
            font=("Segoe UI", 10, "bold"),
            relief="flat",
            padding=(8, 6)
        )
        s.map("Dark.Treeview",
            background=[("selected", COLORS["accent_dim"])],
            foreground=[("selected", COLORS["accent"])]
        )
        s.map("Dark.Treeview.Heading",
            background=[("active", COLORS["bg_hover"])]
        )

        s.configure("Dark.Vertical.TScrollbar",
            background=COLORS["bg_card"],
            troughcolor=COLORS["bg"],
            borderwidth=0,
            arrowsize=0,
            width=6
        )
        s.map("Dark.Vertical.TScrollbar",
            background=[("active", COLORS["border_light"]), ("!active", COLORS["border"])]
        )

    # ─────────────────────────────────────────────────────────
    # UI СТРОИТЕЛЬСТВО
    # ─────────────────────────────────────────────────────────
    def _build_ui(self):
        # Sidebar
        self.sidebar = tk.Frame(self, bg=COLORS["bg_sidebar"], width=230)
        self.sidebar.pack(side="left", fill="y")
        self.sidebar.pack_propagate(False)

        # Logo area
        logo_frame = tk.Frame(self.sidebar, bg=COLORS["bg_sidebar"])
        logo_frame.pack(fill="x", padx=20, pady=(24, 4))

        tk.Label(logo_frame, text="◆", font=("Segoe UI", 22),
                 fg=COLORS["accent"], bg=COLORS["bg_sidebar"]).pack(side="left")
        tk.Label(logo_frame, text=" Shadow", font=("Segoe UI", 15, "bold"),
                 fg=COLORS["text"], bg=COLORS["bg_sidebar"]).pack(side="left", padx=(2, 0))

        tk.Label(self.sidebar, text="ПАНЕЛЬ УПРАВЛЕНИЯ", font=("Segoe UI", 8, "bold"),
                 fg=COLORS["text_dim"], bg=COLORS["bg_sidebar"],
                 anchor="w").pack(fill="x", padx=22, pady=(2, 0))

        # Separator
        self._draw_separator(self.sidebar, 14)

        # Nav label
        tk.Label(self.sidebar, text="НАВИГАЦИЯ", font=("Segoe UI", 8, "bold"),
                 fg=COLORS["text_dim"], bg=COLORS["bg_sidebar"],
                 anchor="w").pack(fill="x", padx=22, pady=(0, 6))

        # Menu buttons
        self.menu_buttons = []
        menu_items = [
            ("📊", "Статистика",      self._show_dashboard),
            ("👤", "Пользователи",    self._show_users),
            ("💬", "Сообщения",       self._show_messages),
            ("💭", "Чаты",            self._show_chats),
            ("🔑", "Сессии",          self._show_sessions),
            ("🔔", "Push-подписки",   self._show_push),
        ]

        for icon, text, command in menu_items:
            btn = self._create_menu_btn(self.sidebar, f"{icon}  {text}", command)
            self.menu_buttons.append(btn)

        # Spacer
        tk.Frame(self.sidebar, bg=COLORS["bg_sidebar"]).pack(fill="both", expand=True)

        # Danger zone
        self._draw_separator(self.sidebar, 4)

        tk.Label(self.sidebar, text="⚠ ОПАСНАЯ ЗОНА", font=("Segoe UI", 8, "bold"),
                 fg=COLORS["danger"], bg=COLORS["bg_sidebar"],
                 anchor="w").pack(fill="x", padx=22, pady=(4, 4))

        reset_btn = self._create_menu_btn(self.sidebar, "🔥  Полный сброс", self._full_reset, danger=True)
        self.menu_buttons.append(reset_btn)

        # Server info
        info_frame = tk.Frame(self.sidebar, bg=COLORS["bg_sidebar"])
        info_frame.pack(fill="x", padx=22, pady=(14, 18))
        tk.Label(info_frame, text="Сервер", font=("Segoe UI", 8),
                 fg=COLORS["text_dim"], bg=COLORS["bg_sidebar"]).pack(anchor="w")
        self.server_label = tk.Label(info_frame, text=DEFAULT_SERVER.replace("https://", ""),
                 font=("Consolas", 8), fg=COLORS["accent"], bg=COLORS["bg_sidebar"])
        self.server_label.pack(anchor="w", pady=(1, 0))
        tk.Label(info_frame, text="v2.1", font=("Segoe UI", 8),
                 fg=COLORS["text_dim"], bg=COLORS["bg_sidebar"]).pack(anchor="w", pady=(4, 0))

        # Main content area
        self.content = tk.Frame(self, bg=COLORS["bg"])
        self.content.pack(side="left", fill="both", expand=True)

    def _draw_separator(self, parent, pad_y=10):
        sep = tk.Canvas(parent, bg=COLORS["bg_sidebar"], height=1, highlightthickness=0)
        sep.pack(fill="x", padx=20, pady=(pad_y, pad_y))
        sep.bind("<Configure>", lambda e: (sep.delete("all"),
                 sep.create_line(0, 0, e.width, 0, fill=COLORS["border"], width=1)))

    def _create_menu_btn(self, parent, text, command, danger=False):
        fg_normal = COLORS["danger"] if danger else COLORS["text_sec"]
        fg_active = COLORS["danger"] if danger else COLORS["accent"]
        bg_normal = COLORS["bg_sidebar"]
        bg_hover = COLORS["danger_dim"] if danger else COLORS["bg_hover"]
        bg_active = COLORS["danger_dim"] if danger else COLORS["accent_dim"]

        btn = tk.Label(parent, text=text, font=("Segoe UI", 11), fg=fg_normal,
                       bg=bg_normal, anchor="w", padx=20, pady=10, cursor="hand2")
        btn.pack(fill="x", padx=8, pady=2)
        btn._command = command
        btn._default_bg = bg_normal
        btn._hover_bg = bg_hover
        btn._active_bg = bg_active
        btn._fg_normal = fg_normal
        btn._fg_active = fg_active
        btn._danger = danger

        btn.bind("<Enter>", lambda e, b=btn: b.configure(bg=b._hover_bg) if not getattr(b, '_is_active', False) else None)
        btn.bind("<Leave>", lambda e, b=btn: b.configure(bg=b._active_bg if getattr(b, '_is_active', False) else b._default_bg))
        btn.bind("<Button-1>", lambda e, b=btn: self._on_menu_click(b))
        return btn

    def _on_menu_click(self, btn):
        for b in self.menu_buttons:
            b._is_active = False
            b.configure(bg=b._default_bg, fg=b._fg_normal)
        btn._is_active = True
        btn.configure(bg=btn._active_bg, fg=btn._fg_active)
        btn._command()

    def _clear_content(self):
        for w in self.content.winfo_children():
            w.destroy()

    def _create_header(self, title, subtitle=""):
        frame = tk.Frame(self.content, bg=COLORS["bg"])
        frame.pack(fill="x", padx=32, pady=(28, 4))
        tk.Label(frame, text=title, font=self.font_title, fg=COLORS["text"], bg=COLORS["bg"]).pack(anchor="w")
        if subtitle:
            tk.Label(frame, text=subtitle, font=self.font_small, fg=COLORS["text_sec"],
                     bg=COLORS["bg"]).pack(anchor="w", pady=(4, 0))
        return frame

    def _create_separator(self):
        sep = tk.Canvas(self.content, bg=COLORS["bg"], height=2, highlightthickness=0)
        sep.pack(fill="x", padx=32, pady=(14, 16))
        sep.bind("<Configure>", lambda e: (sep.delete("all"),
                 sep.create_line(0, 1, e.width, 1, fill=COLORS["border"], width=1)))

    def _create_button(self, parent, text, command, style="primary", width=None):
        colors = {
            "primary":   (COLORS["accent"], COLORS["accent_hover"], "#fff"),
            "danger":    (COLORS["danger"], COLORS["danger_hover"], "#fff"),
            "secondary": (COLORS["bg_hover"], COLORS["border_light"], COLORS["text_sec"]),
        }
        bg, hover, fg = colors.get(style, colors["primary"])

        btn_frame = tk.Frame(parent, bg=bg)
        btn = tk.Label(btn_frame, text=text, font=("Segoe UI", 10, "bold"), fg=fg, bg=bg,
                       padx=18, pady=9, cursor="hand2")
        btn.pack(fill="both")

        if width:
            btn.configure(width=width)

        def on_enter(e):
            btn.configure(bg=hover)
            btn_frame.configure(bg=hover)
        def on_leave(e):
            btn.configure(bg=bg)
            btn_frame.configure(bg=bg)
        def on_click(e):
            btn.configure(fg="#ccc")
            btn.after(100, lambda: btn.configure(fg=fg))
            command()

        btn.bind("<Enter>", on_enter)
        btn.bind("<Leave>", on_leave)
        btn.bind("<Button-1>", on_click)
        btn_frame.bind("<Enter>", on_enter)
        btn_frame.bind("<Leave>", on_leave)

        return btn_frame

    def _create_stat_card(self, parent, icon, label, value, color=None, dim_color=None):
        card = RoundedFrame(parent, bg_color=COLORS["bg_card"],
                            border_color=COLORS["border"], radius=14,
                            width=200, height=110)

        inner = tk.Frame(card, bg=COLORS["bg_card"])
        inner.place(relx=0.5, rely=0.5, anchor="center", relwidth=0.85, relheight=0.8)

        # Colored accent bar
        accent_bar = tk.Frame(inner, bg=color or COLORS["accent"], height=3)
        accent_bar.pack(fill="x", pady=(0, 8))

        top_row = tk.Frame(inner, bg=COLORS["bg_card"])
        top_row.pack(fill="x")
        tk.Label(top_row, text=icon, font=("Segoe UI", 18), bg=COLORS["bg_card"]).pack(side="left")
        tk.Label(top_row, text=label, font=self.font_small, fg=COLORS["text_sec"],
                 bg=COLORS["bg_card"]).pack(side="left", padx=(8, 0))

        val_color = color or COLORS["text"]
        tk.Label(inner, text=str(value), font=("Segoe UI", 28, "bold"), fg=val_color,
                 bg=COLORS["bg_card"]).pack(anchor="w", pady=(6, 0))

        return card

    def _loading(self, text="Загрузка..."):
        self._clear_content()
        frame = tk.Frame(self.content, bg=COLORS["bg"])
        frame.pack(fill="both", expand=True)
        lbl = tk.Label(frame, text="⏳", font=("Segoe UI", 24), bg=COLORS["bg"])
        lbl.pack(expand=True)
        tk.Label(frame, text=text, font=self.font_normal,
                 fg=COLORS["text_sec"], bg=COLORS["bg"]).pack(pady=(0, 40))

    def _threaded(self, func, callback=None):
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
    # DASHBOARD
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
        self._create_separator()

        grid = tk.Frame(self.content, bg=COLORS["bg"])
        grid.pack(fill="x", padx=32)

        items = [
            ("👤", "Пользователей", stats.get("users", 0), COLORS["accent"], COLORS["accent_dim"]),
            ("💭", "Чатов",         stats.get("chats", 0), COLORS["success"], COLORS["success_dim"]),
            ("💬", "Сообщений",     stats.get("messages", 0), COLORS["warning"], COLORS["warning_dim"]),
            ("🔑", "Сессий",        stats.get("sessions", 0), COLORS["text_sec"], None),
            ("🔔", "Push-подписок", stats.get("pushSubs", 0), COLORS["text_dim"], None),
        ]

        for i, (icon, label, value, color, dim) in enumerate(items):
            card = self._create_stat_card(grid, icon, label, value, color, dim)
            card.grid(row=i // 3, column=i % 3, padx=8, pady=8, sticky="nsew")

        for c in range(3):
            grid.columnconfigure(c, weight=1)

        actions = tk.Frame(self.content, bg=COLORS["bg"])
        actions.pack(fill="x", padx=32, pady=(24, 0))
        self._create_button(actions, "🔄  Обновить", self._show_dashboard, "secondary").pack(side="left")

        info = tk.Frame(self.content, bg=COLORS["bg"])
        info.pack(fill="x", padx=32, pady=(20, 0))
        tk.Label(info, text="💡 Совет: дважды кликните по пользователю для просмотра деталей",
                 font=self.font_tiny, fg=COLORS["text_dim"], bg=COLORS["bg"]).pack(anchor="w")

    # ─────────────────────────────────────────────────────────
    # USERS
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

        bar = tk.Frame(self.content, bg=COLORS["bg"])
        bar.pack(fill="x", padx=32, pady=(14, 10))
        self._create_button(bar, "🔄 Обновить", self._show_users, "secondary").pack(side="left", padx=(0, 10))
        self._create_button(bar, "🗑 Удалить выбранного", self._delete_selected_user, "danger").pack(side="left", padx=(0, 10))
        self._create_button(bar, "⚠ Удалить всех", self._delete_all_users, "danger").pack(side="right")

        table_container = tk.Frame(self.content, bg=COLORS["border"])
        table_container.pack(fill="both", expand=True, padx=32, pady=(0, 24))

        table_inner = tk.Frame(table_container, bg=COLORS["bg_card"])
        table_inner.pack(fill="both", expand=True, padx=1, pady=1)

        cols = ("username", "displayName", "createdAt", "lastSeen", "id")
        self.users_tree = ttk.Treeview(table_inner, columns=cols, show="headings", style="Dark.Treeview")

        self.users_tree.heading("username", text="  @username")
        self.users_tree.heading("displayName", text="  Имя")
        self.users_tree.heading("createdAt", text="  Регистрация")
        self.users_tree.heading("lastSeen", text="  Последний визит")
        self.users_tree.heading("id", text="  ID")

        self.users_tree.column("username", width=140, minwidth=100)
        self.users_tree.column("displayName", width=160, minwidth=100)
        self.users_tree.column("createdAt", width=120, minwidth=80)
        self.users_tree.column("lastSeen", width=120, minwidth=80)
        self.users_tree.column("id", width=200, minwidth=120)

        scrollbar = ttk.Scrollbar(table_inner, orient="vertical",
                                  command=self.users_tree.yview,
                                  style="Dark.Vertical.TScrollbar")
        self.users_tree.configure(yscrollcommand=scrollbar.set)

        self.users_tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        self._users_data = users
        for u in users:
            uid = u.get("_id") or u.get("id", "?")
            self.users_tree.insert("", "end", values=(
                f"  @{u.get('username', '?')}",
                f"  {u.get('displayName', '—')}",
                f"  {u.get('createdAt', '')[:10]}",
                f"  {(u.get('lastSeen', '—') or '—')[:10]}",
                f"  {uid}"
            ))

        self.users_tree.bind("<Double-1>", self._user_detail)

    def _delete_selected_user(self):
        sel = self.users_tree.selection()
        if not sel:
            messagebox.showwarning("Внимание", "Выберите пользователя в таблице")
            return
        values = self.users_tree.item(sel[0])["values"]
        uname = str(values[0]).strip()
        uid = str(values[4]).strip()
        name = str(values[1]).strip()

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
        uid = str(values[4]).strip()

        user = None
        for u in self._users_data:
            if (u.get("_id") or u.get("id")) == uid:
                user = u
                break
        if not user:
            return

        win = tk.Toplevel(self)
        win.title(f"Пользователь — {user.get('displayName', '?')}")
        win.geometry("430x500")
        win.configure(bg=COLORS["bg"])
        win.resizable(False, False)
        win.transient(self)
        win.grab_set()

        # Center
        win.update_idletasks()
        px = self.winfo_x() + (self.winfo_width() - 430) // 2
        py = self.winfo_y() + (self.winfo_height() - 500) // 2
        win.geometry(f"+{px}+{py}")

        # Header card
        header = tk.Frame(win, bg=COLORS["bg_card"])
        header.pack(fill="x", padx=16, pady=(16, 0))

        avatar_frame = tk.Frame(header, bg=COLORS["bg_card"])
        avatar_frame.pack(pady=(16, 8))
        avatar_color = user.get("avatarColor", COLORS["accent"])
        initials = "".join(w[0] for w in (user.get("displayName", "?") or "?").split()[:2]).upper()

        avatar_canvas = tk.Canvas(avatar_frame, width=60, height=60,
                                  bg=COLORS["bg_card"], highlightthickness=0)
        avatar_canvas.pack()
        avatar_canvas.create_oval(4, 4, 56, 56, fill=avatar_color, outline="")
        avatar_canvas.create_text(30, 30, text=initials, fill="#fff",
                                  font=("Segoe UI", 16, "bold"))

        tk.Label(header, text=user.get("displayName", "?"), font=("Segoe UI", 16, "bold"),
                 fg=COLORS["text"], bg=COLORS["bg_card"]).pack()
        tk.Label(header, text=f"@{user.get('username', '?')}", font=("Segoe UI", 12),
                 fg=COLORS["accent"], bg=COLORS["bg_card"]).pack(pady=(2, 14))

        # Details
        details = tk.Frame(win, bg=COLORS["bg_card"])
        details.pack(fill="x", padx=16, pady=(8, 0))

        fields = [
            ("ID", (user.get("_id") or user.get("id", "?"))),
            ("Имя", user.get("firstName", "—")),
            ("Фамилия", user.get("lastName", "—")),
            ("Bio", (user.get("bio", "—") or "—")[:60]),
            ("Аватар", "✅ Загружен" if user.get("avatar") else "❌ Нет"),
            ("Регистрация", user.get("createdAt", "?")[:19].replace("T", " ")),
            ("Посл. визит", (user.get("lastSeen", "?") or "—")[:19].replace("T", " ")),
            ("В сети", "🟢 Да" if user.get("online") else "⚫ Нет"),
        ]

        for label, value in fields:
            row = tk.Frame(details, bg=COLORS["bg_card"])
            row.pack(fill="x", padx=16, pady=3)
            tk.Label(row, text=f"{label}:", font=("Segoe UI", 10, "bold"),
                     fg=COLORS["text_sec"], bg=COLORS["bg_card"], width=14, anchor="w").pack(side="left")
            tk.Label(row, text=str(value)[:50], font=("Segoe UI", 10),
                     fg=COLORS["text"], bg=COLORS["bg_card"], anchor="w").pack(side="left", fill="x", expand=True)

        tk.Frame(details, bg=COLORS["bg_card"], height=12).pack()

        btn_frame = tk.Frame(win, bg=COLORS["bg"])
        btn_frame.pack(fill="x", padx=16, pady=(12, 16))
        del_btn = self._create_button(btn_frame, "🗑 Удалить пользователя",
                                       lambda: self._confirm_delete_user(win, user), "danger")
        del_btn.pack(fill="x")

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
    # ACTION PANELS
    # ─────────────────────────────────────────────────────────
    def _create_action_panel(self, icon, title, description, button_text, button_action,
                              button_style="danger", extra_info=None):
        card_outer = tk.Frame(self.content, bg=COLORS["border"])
        card_outer.pack(fill="x", padx=32, pady=10)

        card = tk.Frame(card_outer, bg=COLORS["bg_card"])
        card.pack(fill="x", padx=1, pady=1)

        inner = tk.Frame(card, bg=COLORS["bg_card"])
        inner.pack(fill="x", padx=24, pady=20)

        title_row = tk.Frame(inner, bg=COLORS["bg_card"])
        title_row.pack(fill="x")
        tk.Label(title_row, text=f"{icon}  {title}", font=self.font_header,
                 fg=COLORS["text"], bg=COLORS["bg_card"]).pack(side="left")

        tk.Label(inner, text=description,
                 font=self.font_small, fg=COLORS["text_sec"],
                 bg=COLORS["bg_card"], wraplength=500, justify="left").pack(anchor="w", pady=(6, 14))

        self._create_button(inner, button_text, button_action, button_style).pack(anchor="w")

        if extra_info:
            tk.Label(inner, text=extra_info, font=self.font_tiny,
                     fg=COLORS["text_dim"], bg=COLORS["bg_card"]).pack(anchor="w", pady=(8, 0))

    # ─────────────────────────────────────────────────────────
    # MESSAGES
    # ─────────────────────────────────────────────────────────
    def _show_messages(self):
        self._clear_content()
        self._create_header("💬 Сообщения", "Управление сообщениями в базе данных")
        self._create_separator()
        self._create_action_panel(
            "🗑", "Удалить все сообщения",
            "Это удалит ВСЕ сообщения из всех чатов. Действие необратимо.",
            "Удалить все сообщения", self._delete_messages, "danger",
            "⚠ Будьте осторожны — восстановить данные невозможно"
        )

    def _delete_messages(self):
        if not messagebox.askyesno("Подтверждение", "Удалить ВСЕ сообщения?"):
            return
        self._threaded(
            lambda: api("DELETE", "/api/admin/messages"),
            lambda r: messagebox.showinfo("Готово", f"Удалено: {r.get('deleted', 0)} сообщений")
        )

    # ─────────────────────────────────────────────────────────
    # CHATS
    # ─────────────────────────────────────────────────────────
    def _show_chats(self):
        self._clear_content()
        self._create_header("💭 Чаты", "Управление чатами")
        self._create_separator()
        self._create_action_panel(
            "🗑", "Удалить все чаты",
            "Удалит все чаты и связанные с ними сообщения. Необратимо.",
            "Удалить все чаты", self._delete_chats, "danger"
        )

    def _delete_chats(self):
        if not messagebox.askyesno("Подтверждение", "Удалить ВСЕ чаты и сообщения?"):
            return
        self._threaded(
            lambda: api("DELETE", "/api/admin/chats"),
            lambda r: messagebox.showinfo("Готово",
                f"Чатов: {r.get('deletedChats', 0)}\nСообщений: {r.get('deletedMessages', 0)}")
        )

    # ─────────────────────────────────────────────────────────
    # SESSIONS
    # ─────────────────────────────────────────────────────────
    def _show_sessions(self):
        self._clear_content()
        self._create_header("🔑 Сессии", "Управление пользовательскими сессиями")
        self._create_separator()
        self._create_action_panel(
            "🧹", "Очистить неактивные сессии",
            "Удаляет истёкшие и неактивные сессии из базы данных.",
            "Очистить сессии", self._delete_sessions, "secondary",
            "Рекомендуется периодически очищать для оптимизации"
        )

    def _delete_sessions(self):
        if not messagebox.askyesno("Подтверждение", "Очистить неактивные сессии?"):
            return
        self._threaded(
            lambda: api("DELETE", "/api/admin/sessions"),
            lambda r: messagebox.showinfo("Готово", f"Удалено: {r.get('deleted', 0)} сессий")
        )

    # ─────────────────────────────────────────────────────────
    # PUSH
    # ─────────────────────────────────────────────────────────
    def _show_push(self):
        self._clear_content()
        self._create_header("🔔 Push-подписки", "Управление push-уведомлениями")
        self._create_separator()
        self._create_action_panel(
            "🧹", "Очистить push-подписки",
            "Удаляет все push-подписки. Пользователи перестанут получать push-уведомления.",
            "Очистить подписки", self._delete_push, "secondary"
        )

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

    import tkinter.simpledialog as sd

    tmp = tk.Tk()
    tmp.withdraw()
    tmp.title("Shadow Mess")
    tmp.attributes("-topmost", True)

    result = sd.askstring(
        "Shadow Mess — Подключение",
        "Введите URL сервера:\n(Enter = по умолчанию)",
        initialvalue=DEFAULT_SERVER,
        parent=tmp
    )
    tmp.destroy()

    SERVER = (result or "").strip().rstrip("/") or DEFAULT_SERVER

    app = ShadowAdminApp()
    app.update_idletasks()
    w, h = 1050, 700
    x = (app.winfo_screenwidth() - w) // 2
    y = (app.winfo_screenheight() - h) // 2
    app.geometry(f"{w}x{h}+{x}+{y}")
    app.mainloop()


if __name__ == "__main__":
    main()
