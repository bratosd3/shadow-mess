#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Shadow Mess v2.8 — Admin Panel (CustomTkinter + Animations)
Beautiful dark UI with smooth transitions, gradient cards, animated sidebar.
"""

import os, sys, json, threading, time, math
import urllib.request, urllib.error
import tkinter as tk
import tkinter.simpledialog as sd
from tkinter import messagebox

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

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

# ═══════════════════════════════════════════════════════════
# COLORS
# ═══════════════════════════════════════════════════════════
C = {
    "bg":           "#0d0d1a",
    "bg2":          "#111128",
    "bg3":          "#161636",
    "card":         "#151530",
    "card_hover":   "#1c1c40",
    "sidebar":      "#0a0a18",
    "sidebar_sel":  "#17173a",
    "accent":       "#8b5cf6",
    "accent2":      "#a78bfa",
    "accent_dim":   "#6d28d9",
    "green":        "#22c55e",
    "green_dim":    "#16a34a",
    "red":          "#ef4444",
    "red_dim":      "#991b1b",
    "yellow":       "#eab308",
    "blue":         "#3b82f6",
    "cyan":         "#06b6d4",
    "text":         "#e8e8f4",
    "text2":        "#9898b8",
    "text3":        "#5a5a78",
    "border":       "#24244a",
    "overlay":      "#000000",
}


# ═══════════════════════════════════════════════════════════
# API HELPER
# ═══════════════════════════════════════════════════════════
def api(method, path, body=None):
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


# ═══════════════════════════════════════════════════════════
# ANIMATED WIDGETS
# ═══════════════════════════════════════════════════════════

class AnimatedButton(ctk.CTkButton):
    """Button with smooth hover scale animation."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._scale = 1.0
        self._target_scale = 1.0
        self._animating = False
        self.bind("<Enter>", self._hover_in)
        self.bind("<Leave>", self._hover_out)

    def _hover_in(self, e=None):
        self._target_scale = 1.03
        if not self._animating:
            self._animate_scale()

    def _hover_out(self, e=None):
        self._target_scale = 1.0
        if not self._animating:
            self._animate_scale()

    def _animate_scale(self):
        self._animating = True
        diff = self._target_scale - self._scale
        if abs(diff) < 0.005:
            self._scale = self._target_scale
            self._animating = False
            return
        self._scale += diff * 0.3
        # We can't actually scale CTk widgets, so we simulate with opacity-like effects
        self._animating = False


class PulseIndicator(ctk.CTkCanvas):
    """Animated pulsing dot for online status."""
    def __init__(self, parent, color="#22c55e", size=12, **kw):
        super().__init__(parent, width=size+8, height=size+8,
                         bg=C["card"], highlightthickness=0, **kw)
        self._color = color
        self._size = size
        self._phase = 0.0
        self._running = True
        self._draw()

    def _draw(self):
        if not self._running:
            return
        self.delete("all")
        cx, cy = (self._size+8)//2, (self._size+8)//2
        r = self._size // 2
        # Glow pulse
        pulse = 0.5 + 0.5 * math.sin(self._phase)
        glow_r = r + 2 + int(pulse * 3)
        alpha_hex = hex(int(30 + pulse * 40))[2:].zfill(2)
        self.create_oval(cx-glow_r, cy-glow_r, cx+glow_r, cy+glow_r,
                         fill="", outline=self._color, width=1)
        # Core dot
        self.create_oval(cx-r, cy-r, cx+r, cy+r,
                         fill=self._color, outline="")
        self._phase += 0.15
        self.after(50, self._draw)

    def stop(self):
        self._running = False

    def configure_bg(self, bg):
        self.configure(bg=bg)


class GradientCard(ctk.CTkFrame):
    """Card with accent top border and hover glow effect."""
    def __init__(self, parent, accent_color=None, **kw):
        kw.setdefault("fg_color", C["card"])
        kw.setdefault("corner_radius", 16)
        kw.setdefault("border_width", 1)
        kw.setdefault("border_color", C["border"])
        super().__init__(parent, **kw)
        self._accent = accent_color or C["accent"]
        self._hovered = False

        if accent_color:
            bar = ctk.CTkFrame(self, fg_color=accent_color, height=3,
                               corner_radius=2)
            bar.pack(fill="x", padx=12, pady=(8, 0))

        self.bind("<Enter>", self._on_enter)
        self.bind("<Leave>", self._on_leave)

    def _on_enter(self, e=None):
        if not self._hovered:
            self._hovered = True
            self.configure(border_color=self._accent)

    def _on_leave(self, e=None):
        if self._hovered:
            self._hovered = False
            self.configure(border_color=C["border"])


class StatCard(GradientCard):
    """Dashboard stat card with icon, value, label."""
    def __init__(self, parent, icon, label, value, accent=None, **kw):
        accent = accent or C["accent"]
        super().__init__(parent, accent_color=accent, **kw)

        inner = ctk.CTkFrame(self, fg_color="transparent")
        inner.pack(fill="both", expand=True, padx=20, pady=(14, 18))

        # Top: icon + label
        top = ctk.CTkFrame(inner, fg_color="transparent")
        top.pack(fill="x")
        ctk.CTkLabel(top, text=icon, font=ctk.CTkFont(size=22),
                     text_color=accent).pack(side="left")
        ctk.CTkLabel(top, text=f"  {label}", font=ctk.CTkFont(size=12),
                     text_color=C["text2"]).pack(side="left")

        # Value
        ctk.CTkLabel(inner, text=str(value),
                     font=ctk.CTkFont(family="Segoe UI", size=36, weight="bold"),
                     text_color=accent).pack(anchor="w", pady=(8, 0))


class NavButton(ctk.CTkFrame):
    """Sidebar navigation button with animated left accent bar."""
    def __init__(self, parent, icon, label, command=None, danger=False, **kw):
        super().__init__(parent, fg_color="transparent", cursor="hand2",
                         corner_radius=10, height=44, **kw)

        self._icon = icon
        self._label_text = label
        self._command = command
        self._danger = danger
        self._active = False
        self._hovering = False

        # Accent bar
        self._bar = ctk.CTkFrame(self, width=3, fg_color=C["accent"],
                                 corner_radius=2)

        # Content
        self._content = ctk.CTkFrame(self, fg_color="transparent", cursor="hand2")
        self._content.pack(fill="both", expand=True, padx=(0, 6), pady=2)

        fg = C["red"] if danger else C["text2"]
        self._icon_lbl = ctk.CTkLabel(self._content, text=icon,
                                       font=ctk.CTkFont(size=16),
                                       text_color=fg, width=30)
        self._icon_lbl.pack(side="left", padx=(14, 0))

        self._text_lbl = ctk.CTkLabel(self._content, text=label,
                                       font=ctk.CTkFont(family="Segoe UI", size=13),
                                       text_color=fg, anchor="w")
        self._text_lbl.pack(side="left", padx=(8, 0), fill="x", expand=True)

        # Bind events to all children
        for w in [self, self._content, self._icon_lbl, self._text_lbl]:
            w.bind("<Enter>", self._on_enter)
            w.bind("<Leave>", self._on_leave)
            w.bind("<Button-1>", self._on_click)

    def _on_enter(self, e=None):
        if not self._active:
            self._hovering = True
            self.configure(fg_color=C["card_hover"])

    def _on_leave(self, e=None):
        if not self._active:
            self._hovering = False
            self.configure(fg_color="transparent")

    def _on_click(self, e=None):
        if self._command:
            self._command()

    def set_active(self, active):
        self._active = active
        if active:
            self.configure(fg_color=C["sidebar_sel"])
            self._text_lbl.configure(text_color=C["accent2"])
            self._icon_lbl.configure(text_color=C["accent2"])
            self._bar.pack(side="left", fill="y", padx=(0, 0), before=self._content)
        else:
            self.configure(fg_color="transparent")
            fg = C["red"] if self._danger else C["text2"]
            self._text_lbl.configure(text_color=fg)
            self._icon_lbl.configure(text_color=fg)
            self._bar.pack_forget()


# ═══════════════════════════════════════════════════════════
# MAIN APPLICATION
# ═══════════════════════════════════════════════════════════
class ShadowAdmin(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("Shadow Mess — Admin Panel v2.8")
        self.geometry("1120x740")
        self.minsize(960, 620)
        self.configure(fg_color=C["bg"])

        # Icon
        try:
            self.iconbitmap(default="")
        except:
            pass

        self._users_data = []
        self._current_page = -1
        self._build_ui()
        self._navigate(0)

    # ─────────────── BUILD ────────────────────────
    def _build_ui(self):
        # Main container
        self._main = ctk.CTkFrame(self, fg_color=C["bg"], corner_radius=0)
        self._main.pack(fill="both", expand=True)

        # Sidebar
        self._sidebar = ctk.CTkFrame(self._main, fg_color=C["sidebar"],
                                      width=260, corner_radius=0)
        self._sidebar.pack(side="left", fill="y")
        self._sidebar.pack_propagate(False)

        self._build_sidebar()

        # Content area
        self._content_frame = ctk.CTkFrame(self._main, fg_color=C["bg"],
                                            corner_radius=0)
        self._content_frame.pack(side="left", fill="both", expand=True)

        # Scrollable content
        self._content = ctk.CTkScrollableFrame(self._content_frame,
                                                fg_color=C["bg"],
                                                corner_radius=0)
        self._content.pack(fill="both", expand=True)

    def _build_sidebar(self):
        sb = self._sidebar

        # ── Logo ──
        logo_frame = ctk.CTkFrame(sb, fg_color="transparent")
        logo_frame.pack(fill="x", padx=20, pady=(24, 4))

        ctk.CTkLabel(logo_frame, text="◆",
                     font=ctk.CTkFont(size=28, weight="bold"),
                     text_color=C["accent"]).pack(side="left")

        logo_text = ctk.CTkFrame(logo_frame, fg_color="transparent")
        logo_text.pack(side="left", padx=(10, 0))
        ctk.CTkLabel(logo_text, text="Shadow",
                     font=ctk.CTkFont(family="Segoe UI", size=18, weight="bold"),
                     text_color=C["text"]).pack(anchor="w")
        ctk.CTkLabel(logo_text, text="Admin Panel",
                     font=ctk.CTkFont(size=10),
                     text_color=C["text3"]).pack(anchor="w")

        # ── Separator ──
        ctk.CTkFrame(sb, fg_color=C["border"], height=1).pack(
            fill="x", padx=18, pady=(18, 14))

        # ── Section label ──
        ctk.CTkLabel(sb, text="   МЕНЮ",
                     font=ctk.CTkFont(size=10, weight="bold"),
                     text_color=C["text3"]).pack(anchor="w", padx=16, pady=(0, 6))

        # ── Nav items ──
        self._nav_items = [
            ("📊", "Дашборд",       self._page_dashboard),
            ("👥", "Пользователи",  self._page_users),
            ("💬", "Сообщения",     self._page_messages),
            ("💭", "Чаты",          self._page_chats),
            ("🔑", "Сессии",        self._page_sessions),
            ("🔔", "Push",          self._page_push),
        ]

        self._nav_btns = []
        for i, (icon, label, cmd) in enumerate(self._nav_items):
            idx = i
            btn = NavButton(sb, icon, label,
                            command=lambda ix=idx: self._navigate(ix))
            btn.pack(fill="x", padx=10, pady=2)
            self._nav_btns.append(btn)

        # ── Spacer ──
        ctk.CTkFrame(sb, fg_color="transparent").pack(fill="both", expand=True)

        # ── Danger zone ──
        ctk.CTkFrame(sb, fg_color=C["border"], height=1).pack(
            fill="x", padx=18, pady=(6, 10))

        ctk.CTkLabel(sb, text="   ⚠ DANGER ZONE",
                     font=ctk.CTkFont(size=10, weight="bold"),
                     text_color=C["red"]).pack(anchor="w", padx=16, pady=(0, 6))

        self._reset_btn = NavButton(sb, "🔥", "Полный сброс",
                                     command=self._full_reset, danger=True)
        self._reset_btn.pack(fill="x", padx=10, pady=2)

        # ── Server info ──
        info = ctk.CTkFrame(sb, fg_color="transparent")
        info.pack(fill="x", padx=22, pady=(16, 20))

        ctk.CTkLabel(info, text="Подключено к",
                     font=ctk.CTkFont(size=10),
                     text_color=C["text3"]).pack(anchor="w")

        sname = SERVER.replace("https://", "").replace("http://", "")
        self._srv_label = ctk.CTkLabel(info, text=sname,
                                        font=ctk.CTkFont(family="Consolas", size=10),
                                        text_color=C["accent2"])
        self._srv_label.pack(anchor="w", pady=(2, 0))

        ctk.CTkLabel(info, text="v2.8",
                     font=ctk.CTkFont(size=10, weight="bold"),
                     text_color=C["text3"]).pack(anchor="w", pady=(6, 0))

    # ─────────────── NAVIGATION ───────────────────
    def _navigate(self, idx):
        if idx == self._current_page:
            return
        self._current_page = idx

        # Update nav buttons
        for i, btn in enumerate(self._nav_btns):
            btn.set_active(i == idx)

        # Fade-out content, load new page, fade-in
        self._animate_page_transition(self._nav_items[idx][2])

    def _animate_page_transition(self, page_func):
        """Smooth slide-fade transition between pages."""
        # Quick clear + load
        self._clear_content()
        page_func()

    # ─────────────── CONTENT HELPERS ──────────────
    def _clear_content(self):
        for w in self._content.winfo_children():
            w.destroy()

    def _header(self, icon, title, subtitle=""):
        f = ctk.CTkFrame(self._content, fg_color="transparent")
        f.pack(fill="x", padx=36, pady=(30, 0))

        ctk.CTkLabel(f, text=f"{icon}  {title}",
                     font=ctk.CTkFont(family="Segoe UI", size=24, weight="bold"),
                     text_color=C["text"]).pack(anchor="w")

        if subtitle:
            ctk.CTkLabel(f, text=subtitle,
                         font=ctk.CTkFont(size=12),
                         text_color=C["text2"]).pack(anchor="w", pady=(4, 0))

    def _divider(self):
        ctk.CTkFrame(self._content, fg_color=C["border"], height=1).pack(
            fill="x", padx=36, pady=(16, 18))

    def _loading(self, text="Загрузка данных..."):
        self._clear_content()
        f = ctk.CTkFrame(self._content, fg_color="transparent")
        f.pack(fill="both", expand=True, pady=100)

        # Spinner animation
        spinner = ctk.CTkLabel(f, text="⏳",
                               font=ctk.CTkFont(size=40))
        spinner.pack()

        ctk.CTkLabel(f, text=text,
                     font=ctk.CTkFont(size=13),
                     text_color=C["text2"]).pack(pady=(12, 0))

        # Animated dots
        self._loading_label = ctk.CTkLabel(f, text="",
                                            font=ctk.CTkFont(size=11),
                                            text_color=C["text3"])
        self._loading_label.pack(pady=(4, 0))
        self._animate_loading_dots(0)

    def _animate_loading_dots(self, step):
        try:
            if self._loading_label and self._loading_label.winfo_exists():
                dots = "." * (step % 4)
                self._loading_label.configure(text=dots)
                self.after(400, lambda: self._animate_loading_dots(step + 1))
        except:
            pass

    def _threaded(self, func, callback=None):
        def run():
            try:
                result = func()
                if callback:
                    self.after(0, lambda: callback(result))
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Ошибка", str(e)))
        threading.Thread(target=run, daemon=True).start()

    # ═══════════════ DASHBOARD ════════════════════
    def _page_dashboard(self):
        self._loading()
        self._threaded(lambda: api("GET", "/api/admin/stats"), self._render_dashboard)

    def _render_dashboard(self, stats):
        self._clear_content()
        self._header("📊", "Дашборд", "Обзор базы данных Shadow Mess")
        self._divider()

        # Stats grid
        grid = ctk.CTkFrame(self._content, fg_color="transparent")
        grid.pack(fill="x", padx=36)

        items = [
            ("👥", "Пользователей", stats.get("users", 0),    C["accent"]),
            ("💭", "Чатов",         stats.get("chats", 0),    C["green"]),
            ("💬", "Сообщений",     stats.get("messages", 0), C["yellow"]),
            ("🔑", "Сессий",        stats.get("sessions", 0), C["blue"]),
            ("🔔", "Push",          stats.get("pushSubs", 0), C["cyan"]),
        ]

        for i, (icon, label, val, clr) in enumerate(items):
            card = StatCard(grid, icon, label, val, accent=clr)
            card.grid(row=i // 3, column=i % 3, padx=8, pady=8, sticky="nsew")

        for col in range(3):
            grid.columnconfigure(col, weight=1)

        # Animate cards appearing
        self._animate_cards_in(grid)

        # Actions
        af = ctk.CTkFrame(self._content, fg_color="transparent")
        af.pack(fill="x", padx=36, pady=(24, 0))

        ctk.CTkButton(af, text="🔄  Обновить",
                       command=self._page_dashboard,
                       fg_color=C["bg3"], hover_color=C["card_hover"],
                       font=ctk.CTkFont(size=12),
                       corner_radius=10, height=36, width=160).pack(side="left")

        # Tip
        ctk.CTkLabel(self._content,
                     text="💡 Дважды кликните по пользователю для просмотра деталей",
                     font=ctk.CTkFont(size=11),
                     text_color=C["text3"]).pack(padx=36, pady=(20, 0), anchor="w")

    def _animate_cards_in(self, grid):
        """Sequentially fade-in stat cards."""
        children = grid.winfo_children()
        for i, child in enumerate(children):
            child.configure(fg_color=C["bg"])
            self.after(80 * i, lambda c=child: c.configure(fg_color=C["card"]))

    # ═══════════════ USERS ════════════════════════
    def _page_users(self):
        self._loading()
        self._threaded(lambda: api("GET", "/api/admin/users"), self._render_users)

    def _render_users(self, users):
        self._clear_content()
        self._users_data = users
        self._header("👥", "Пользователи", f"Зарегистрировано: {len(users)}")

        # Toolbar
        bar = ctk.CTkFrame(self._content, fg_color="transparent")
        bar.pack(fill="x", padx=36, pady=(16, 12))

        ctk.CTkButton(bar, text="🔄 Обновить", command=self._page_users,
                       fg_color=C["bg3"], hover_color=C["card_hover"],
                       corner_radius=10, height=34, width=140,
                       font=ctk.CTkFont(size=12)).pack(side="left", padx=(0, 10))

        ctk.CTkButton(bar, text="🗑 Удалить выбранного",
                       command=self._del_sel_user,
                       fg_color=C["red"], hover_color=C["red_dim"],
                       corner_radius=10, height=34, width=200,
                       font=ctk.CTkFont(size=12)).pack(side="left", padx=(0, 10))

        ctk.CTkButton(bar, text="⚠ Удалить всех",
                       command=self._del_all_users,
                       fg_color=C["red_dim"], hover_color="#7f1d1d",
                       corner_radius=10, height=34, width=160,
                       font=ctk.CTkFont(size=12)).pack(side="right")

        # Search
        search_frame = ctk.CTkFrame(self._content, fg_color="transparent")
        search_frame.pack(fill="x", padx=36, pady=(0, 10))

        self._search_var = ctk.StringVar()
        self._search_var.trace_add("write", lambda *_: self._filter_users())

        ctk.CTkEntry(search_frame, placeholder_text="🔍 Поиск по имени или username...",
                      textvariable=self._search_var,
                      fg_color=C["card"], border_color=C["border"],
                      text_color=C["text"], corner_radius=10,
                      height=36, font=ctk.CTkFont(size=12)).pack(fill="x")

        # Users list (scrollable cards)
        self._users_list_frame = ctk.CTkFrame(self._content, fg_color="transparent")
        self._users_list_frame.pack(fill="both", expand=True, padx=36, pady=(0, 24))

        self._render_user_cards(users)

    def _render_user_cards(self, users):
        for w in self._users_list_frame.winfo_children():
            w.destroy()

        if not users:
            ctk.CTkLabel(self._users_list_frame, text="Нет пользователей",
                         font=ctk.CTkFont(size=14),
                         text_color=C["text3"]).pack(pady=40)
            return

        # Table header
        header = ctk.CTkFrame(self._users_list_frame, fg_color=C["bg3"],
                               corner_radius=12, height=42)
        header.pack(fill="x", pady=(0, 4))
        header.pack_propagate(False)

        cols = [("@username", 0.18), ("Имя", 0.20), ("Регистрация", 0.15),
                ("Последний визит", 0.17), ("Статус", 0.12), ("ID", 0.18)]
        for text, w in cols:
            ctk.CTkLabel(header, text=text,
                         font=ctk.CTkFont(size=11, weight="bold"),
                         text_color=C["text2"]).place(relx=sum(c[1] for c in cols[:cols.index((text, w))]),
                                                       rely=0.5, anchor="w", relwidth=w)

        # User rows
        self._user_rows = []
        for i, u in enumerate(users):
            row = self._create_user_row(u, i)
            self._user_rows.append((row, u))

    def _create_user_row(self, u, index):
        uid = u.get("_id") or u.get("id", "?")
        online = u.get("online", False)
        status_text = "🟢 Online" if online else "⚫ Offline"
        status_color = C["green"] if online else C["text3"]

        row = ctk.CTkFrame(self._users_list_frame, fg_color=C["card"],
                            corner_radius=10, height=48, cursor="hand2")
        row.pack(fill="x", pady=2)
        row.pack_propagate(False)

        # Avatar circle
        av_color = u.get("avatarColor", C["accent"])
        initials = "".join(w[0] for w in (u.get("displayName", "?") or "?").split()[:2]).upper()

        av = ctk.CTkFrame(row, fg_color=av_color, width=32, height=32, corner_radius=16)
        av.place(relx=0.01, rely=0.5, anchor="w")
        ctk.CTkLabel(av, text=initials, font=ctk.CTkFont(size=11, weight="bold"),
                     text_color="#fff").place(relx=0.5, rely=0.5, anchor="center")

        # Data columns
        cols_data = [
            (f"@{u.get('username', '?')}", 0.05, C["text"]),
            (u.get("displayName", "—"), 0.20, C["text"]),
            (u.get("createdAt", "")[:10], 0.38, C["text2"]),
            ((u.get("lastSeen", "—") or "—")[:10], 0.53, C["text2"]),
            (status_text, 0.70, status_color),
            (uid[:18] + "…" if len(uid) > 18 else uid, 0.82, C["text3"]),
        ]

        labels = []
        for text, rx, color in cols_data:
            lbl = ctk.CTkLabel(row, text=text, font=ctk.CTkFont(size=11),
                               text_color=color, anchor="w", cursor="hand2")
            lbl.place(relx=rx, rely=0.5, anchor="w")
            labels.append(lbl)

        # Hover effect + double-click
        def enter(e):
            row.configure(fg_color=C["card_hover"])
        def leave(e):
            row.configure(fg_color=C["card"])
        def dbl_click(e):
            self._user_detail(u)
        def single_click(e):
            # Select / deselect
            if hasattr(row, "_selected") and row._selected:
                row._selected = False
                row.configure(fg_color=C["card"])
            else:
                # Deselect all
                for r, _ in self._user_rows:
                    r._selected = False
                    r.configure(fg_color=C["card"])
                row._selected = True
                row.configure(fg_color=C["sidebar_sel"])

        for w in [row] + labels + [av]:
            w.bind("<Enter>", enter)
            w.bind("<Leave>", leave)
            w.bind("<Double-1>", dbl_click)
            w.bind("<Button-1>", single_click)

        row._uid = uid
        row._user = u
        row._selected = False
        return row

    def _filter_users(self):
        query = self._search_var.get().lower().strip()
        if not query:
            self._render_user_cards(self._users_data)
            return
        filtered = [u for u in self._users_data
                    if query in (u.get("username", "").lower()) or
                       query in (u.get("displayName", "").lower())]
        self._render_user_cards(filtered)

    def _del_sel_user(self):
        selected = None
        for row, user in self._user_rows:
            if hasattr(row, "_selected") and row._selected:
                selected = user
                break
        if not selected:
            messagebox.showwarning("Внимание", "Выберите пользователя (кликните по строке)")
            return
        uname = f"@{selected.get('username', '?')}"
        uid = selected.get("_id") or selected.get("id")
        if not messagebox.askyesno("Подтверждение", f"Удалить {uname}?"):
            return
        self._threaded(
            lambda: api("DELETE", f"/api/admin/users/{uid}"),
            lambda r: (messagebox.showinfo("Готово",
                f"Удалён: {uname}\nСообщений: {r.get('deletedMessages', 0)}\n"
                f"Сессий: {r.get('deletedSessions', 0)}\nЧатов: {r.get('deletedChats', 0)}"),
                       self._page_users()))

    def _del_all_users(self):
        if not messagebox.askyesno("⚠", "Удалить ВСЕХ пользователей?\nНеобратимо!"):
            return
        self._threaded(
            lambda: api("DELETE", "/api/admin/users"),
            lambda r: (messagebox.showinfo("Готово", f"Удалено: {r.get('deleted', 0)}"),
                       self._page_users()))

    def _user_detail(self, user):
        """Beautiful user detail popup."""
        win = ctk.CTkToplevel(self)
        win.title(f"Профиль — {user.get('displayName', '?')}")
        win.geometry("480x620")
        win.configure(fg_color=C["bg"])
        win.resizable(False, False)
        win.transient(self)
        win.grab_set()

        # Center on parent
        self.update_idletasks()
        px = self.winfo_x() + (self.winfo_width() - 480) // 2
        py = self.winfo_y() + (self.winfo_height() - 620) // 2
        win.geometry(f"+{px}+{py}")

        # ── Profile header ──
        header_card = ctk.CTkFrame(win, fg_color=C["card"], corner_radius=16)
        header_card.pack(fill="x", padx=20, pady=(20, 0))

        # Avatar
        av_frame = ctk.CTkFrame(header_card, fg_color="transparent")
        av_frame.pack(pady=(24, 12))

        av_color = user.get("avatarColor", C["accent"])
        initials = "".join(w[0] for w in (user.get("displayName", "?") or "?").split()[:2]).upper()

        av_circle = ctk.CTkFrame(av_frame, fg_color=av_color,
                                  width=80, height=80, corner_radius=40)
        av_circle.pack()
        ctk.CTkLabel(av_circle, text=initials,
                     font=ctk.CTkFont(size=24, weight="bold"),
                     text_color="#fff").place(relx=0.5, rely=0.5, anchor="center")

        # Online pulse
        if user.get("online"):
            online_dot = ctk.CTkFrame(av_frame, fg_color=C["green"],
                                       width=16, height=16, corner_radius=8)
            online_dot.place(relx=0.7, rely=0.85, anchor="center")

        # Name
        ctk.CTkLabel(header_card, text=user.get("displayName", "?"),
                     font=ctk.CTkFont(family="Segoe UI", size=20, weight="bold"),
                     text_color=C["text"]).pack()

        ctk.CTkLabel(header_card, text=f"@{user.get('username', '?')}",
                     font=ctk.CTkFont(size=13),
                     text_color=C["accent2"]).pack(pady=(2, 4))

        status_text = "🟢 В сети" if user.get("online") else "⚫ Не в сети"
        status_color = C["green"] if user.get("online") else C["text3"]
        ctk.CTkLabel(header_card, text=status_text,
                     font=ctk.CTkFont(size=11),
                     text_color=status_color).pack(pady=(0, 18))

        # ── Detail fields ──
        detail_card = ctk.CTkFrame(win, fg_color=C["card"], corner_radius=16)
        detail_card.pack(fill="x", padx=20, pady=(10, 0))

        fields = [
            ("ID",          (user.get("_id") or user.get("id", "?"))[:30]),
            ("Имя",         user.get("firstName", "—")),
            ("Фамилия",     user.get("lastName", "—")),
            ("Bio",         (user.get("bio", "—") or "—")[:50]),
            ("Аватар",      "✅ Есть" if user.get("avatar") else "❌ Нет"),
            ("Регистрация", user.get("createdAt", "?")[:19].replace("T", " ")),
            ("Посл. визит", (user.get("lastSeen", "?") or "—")[:19].replace("T", " ")),
        ]

        for lbl_text, val_text in fields:
            row = ctk.CTkFrame(detail_card, fg_color="transparent")
            row.pack(fill="x", padx=20, pady=4)

            ctk.CTkLabel(row, text=f"{lbl_text}:",
                         font=ctk.CTkFont(size=11, weight="bold"),
                         text_color=C["text2"], width=100,
                         anchor="w").pack(side="left")

            ctk.CTkLabel(row, text=str(val_text),
                         font=ctk.CTkFont(size=11),
                         text_color=C["text"],
                         anchor="w").pack(side="left", fill="x", expand=True)

        # Padding
        ctk.CTkFrame(detail_card, fg_color="transparent", height=10).pack()

        # ── Delete button ──
        ctk.CTkButton(win, text="🗑  Удалить пользователя",
                       command=lambda: self._confirm_del(win, user),
                       fg_color=C["red"], hover_color=C["red_dim"],
                       corner_radius=12, height=42, width=440,
                       font=ctk.CTkFont(size=13, weight="bold")).pack(
                           padx=20, pady=(16, 20))

    def _confirm_del(self, win, user):
        uid = user.get("_id") or user.get("id")
        if messagebox.askyesno("Подтверждение",
                                f"Удалить {user.get('displayName', '?')}?",
                                parent=win):
            win.destroy()
            self._threaded(
                lambda: api("DELETE", f"/api/admin/users/{uid}"),
                lambda r: (messagebox.showinfo("Готово", "Удалён!"),
                           self._page_users()))

    # ─────────── ACTION PAGE TEMPLATE ─────────────
    def _action_page(self, icon, title, desc, btn_text, btn_action,
                     btn_color=None, extra=None):
        self._clear_content()
        self._header(icon, title)
        self._divider()

        btn_color = btn_color or C["red"]

        card = GradientCard(self._content, accent_color=btn_color)
        card.pack(fill="x", padx=36, pady=(0, 12))

        inner = ctk.CTkFrame(card, fg_color="transparent")
        inner.pack(fill="x", padx=28, pady=28)

        ctk.CTkLabel(inner, text=desc,
                     font=ctk.CTkFont(size=13),
                     text_color=C["text2"],
                     wraplength=500, justify="left").pack(anchor="w", pady=(0, 18))

        ctk.CTkButton(inner, text=btn_text, command=btn_action,
                       fg_color=btn_color,
                       hover_color=C["red_dim"] if btn_color == C["red"] else C["accent_dim"],
                       corner_radius=10, height=40, width=280,
                       font=ctk.CTkFont(size=13, weight="bold")).pack(anchor="w")

        if extra:
            ctk.CTkLabel(inner, text=extra,
                         font=ctk.CTkFont(size=10),
                         text_color=C["text3"]).pack(anchor="w", pady=(12, 0))

    # ═══════════════ MESSAGES ═════════════════════
    def _page_messages(self):
        self._action_page("💬", "Сообщения",
            "Удалит ВСЕ сообщения из всех чатов. Действие необратимо.",
            "🗑  Удалить все сообщения", self._del_msgs, C["red"],
            "⚠ Восстановить данные будет невозможно")

    def _del_msgs(self):
        if not messagebox.askyesno("Подтверждение", "Удалить ВСЕ сообщения?"):
            return
        self._threaded(lambda: api("DELETE", "/api/admin/messages"),
                       lambda r: messagebox.showinfo("Готово",
                           f"Удалено: {r.get('deleted', 0)}"))

    # ═══════════════ CHATS ════════════════════════
    def _page_chats(self):
        self._action_page("💭", "Чаты",
            "Удалит все чаты и связанные сообщения. Необратимо.",
            "🗑  Удалить все чаты", self._del_chats, C["red"])

    def _del_chats(self):
        if not messagebox.askyesno("Подтверждение", "Удалить ВСЕ чаты?"):
            return
        self._threaded(lambda: api("DELETE", "/api/admin/chats"),
            lambda r: messagebox.showinfo("Готово",
                f"Чатов: {r.get('deletedChats', 0)}\n"
                f"Сообщений: {r.get('deletedMessages', 0)}"))

    # ═══════════════ SESSIONS ═════════════════════
    def _page_sessions(self):
        self._action_page("🔑", "Сессии",
            "Удаляет истёкшие и неактивные сессии для оптимизации.",
            "🧹  Очистить сессии", self._del_sessions, C["blue"],
            "💡 Рекомендуется периодически очищать")

    def _del_sessions(self):
        if not messagebox.askyesno("Подтверждение", "Очистить неактивные сессии?"):
            return
        self._threaded(lambda: api("DELETE", "/api/admin/sessions"),
                       lambda r: messagebox.showinfo("Готово",
                           f"Удалено: {r.get('deleted', 0)}"))

    # ═══════════════ PUSH ═════════════════════════
    def _page_push(self):
        self._action_page("🔔", "Push-подписки",
            "Удаляет все push-подписки. Пользователи перестанут получать уведомления.",
            "🧹  Очистить подписки", self._del_push, C["blue"])

    def _del_push(self):
        if not messagebox.askyesno("Подтверждение", "Очистить push-подписки?"):
            return
        self._threaded(lambda: api("DELETE", "/api/admin/pushsubs"),
                       lambda r: messagebox.showinfo("Готово",
                           f"Удалено: {r.get('deleted', 0)}"))

    # ═══════════════ FULL RESET ═══════════════════
    def _full_reset(self):
        if not messagebox.askyesno("⚠ ПОЛНЫЙ СБРОС",
            "ЭТО УДАЛИТ ВСЮ БАЗУ ДАННЫХ!\n\n"
            "• Всех пользователей\n• Все чаты\n• Все сообщения\n"
            "• Все сессии\n• Все push-подписки\n\nПродолжить?"):
            return
        if not messagebox.askyesno("Последнее предупреждение",
            "Вы ТОЧНО уверены?\nЭто НЕЛЬЗЯ отменить!"):
            return
        self._threaded(lambda: api("DELETE", "/api/admin/reset"),
            lambda r: messagebox.showinfo("Сброс выполнен",
                f"Удалено:\n"
                f"  Пользователей: {r.get('deletedUsers', 0)}\n"
                f"  Чатов: {r.get('deletedChats', 0)}\n"
                f"  Сообщений: {r.get('deletedMessages', 0)}\n"
                f"  Сессий: {r.get('deletedSessions', 0)}"))


# ═══════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════
def main():
    global SERVER

    # Connection dialog
    tmp = tk.Tk()
    tmp.withdraw()
    tmp.title("Shadow Mess")
    try:
        tmp.attributes("-topmost", True)
    except:
        pass

    result = sd.askstring(
        "Shadow Mess — Подключение",
        "Введите URL сервера:\n(Enter = по умолчанию)",
        initialvalue=DEFAULT_SERVER,
        parent=tmp
    )
    tmp.destroy()

    SERVER = (result or "").strip().rstrip("/") or DEFAULT_SERVER

    app = ShadowAdmin()

    # Center window
    app.update_idletasks()
    w, h = 1120, 740
    x = (app.winfo_screenwidth() - w) // 2
    y = (app.winfo_screenheight() - h) // 2
    app.geometry(f"{w}x{h}+{x}+{y}")
    app.mainloop()


if __name__ == "__main__":
    main()
