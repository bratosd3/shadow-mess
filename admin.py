#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Shadow Messenger — Admin Panel v4.1 (Complete Redesign)
import os
import sys
import subprocess
import threading

# Auto-install dependencies
def ensure_package(name, pip_name=None):
    try:
        __import__(name)
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name or name])

ensure_package("requests")
ensure_package("customtkinter")

import requests
import customtkinter as ctk

# Config
DEFAULT_URL = "https://shadow-mess.onrender.com"
DEFAULT_KEY = "shadow_admin_secret_2026"

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

# Palette
BG_MAIN    = "#0c0c1d"
BG_SIDE    = "#10102a"
BG_CARD    = "#161637"
BG_CARD_H  = "#1c1c45"
BG_INPUT   = "#12122e"
BG_HEADER  = "#0e0e24"
BRAND       = "#7c3aed"
BRAND_H     = "#6d28d9"
BRAND_L     = "#a78bfa"
TEXT_W      = "#f1f5f9"
TEXT_S      = "#94a3b8"
TEXT_D      = "#64748b"
BORDER      = "#1e1e4a"
RED         = "#ef4444"
RED_H       = "#dc2626"
GREEN       = "#22c55e"
GREEN_H     = "#16a34a"
YELLOW      = "#eab308"
ORANGE      = "#f97316"
BLUE        = "#3b82f6"
CYAN        = "#06b6d4"
GOLD        = "#ffd700"
PINK        = "#ec4899"

FONT        = "Segoe UI"
FONT_MONO   = "Consolas"


class AdminApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Shadow Messenger \u2666 Admin Panel v4.1")
        self.geometry("1160x760")
        self.minsize(960, 600)
        self.configure(fg_color=BG_MAIN)

        self.server_url = os.environ.get("SHADOW_SERVER", DEFAULT_URL)
        self.admin_key = os.environ.get("SHADOW_ADMIN_KEY", DEFAULT_KEY)
        self._users_cache = []

        self._build_ui()
        self.show_page("dashboard")

    @property
    def headers(self):
        return {"X-Admin-Key": self.admin_key, "Content-Type": "application/json"}

    # === API helpers ===
    def api_get(self, path):
        try:
            r = requests.get(f"{self.server_url}{path}", headers=self.headers, timeout=15)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            return {"_error": str(e)}

    def api_delete(self, path):
        try:
            r = requests.delete(f"{self.server_url}{path}", headers=self.headers, timeout=15)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            return {"_error": str(e)}

    def api_put(self, path, data=None):
        try:
            r = requests.put(f"{self.server_url}{path}", headers=self.headers, json=data, timeout=15)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            return {"_error": str(e)}

    def _run_async(self, func, callback):
        def worker():
            result = func()
            self.after(0, lambda: callback(result))
        threading.Thread(target=worker, daemon=True).start()

    # === Build UI ===
    def _build_ui(self):
        # Top bar
        topbar = ctk.CTkFrame(self, height=52, fg_color=BG_HEADER, corner_radius=0)
        topbar.pack(fill="x")
        topbar.pack_propagate(False)

        ctk.CTkLabel(topbar, text="\U0001f30c Shadow Admin", font=(FONT, 16, "bold"),
                     text_color=BRAND_L).pack(side="left", padx=20)

        self.status_pill = ctk.CTkLabel(topbar, text="\u25cf \u041d\u0435 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u043e",
                                        font=(FONT, 11), text_color=RED)
        self.status_pill.pack(side="right", padx=20)

        ctk.CTkLabel(topbar, text="v4.0", font=(FONT, 10), text_color=TEXT_D).pack(side="right", padx=(0, 10))

        # Main layout
        main = ctk.CTkFrame(self, fg_color="transparent")
        main.pack(fill="both", expand=True)

        # Sidebar
        self.sidebar = ctk.CTkFrame(main, width=200, fg_color=BG_SIDE, corner_radius=0)
        self.sidebar.pack(side="left", fill="y")
        self.sidebar.pack_propagate(False)

        nav_items = [
            ("dashboard", "\U0001f3e0", "\u0413\u043b\u0430\u0432\u043d\u0430\u044f"),
            ("users",     "\U0001f465", "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438"),
            ("premium",   "\u2b50",     "Premium"),
            ("tools",     "\U0001f527", "\u0418\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u044b"),
            ("settings",  "\u2699\ufe0f", "\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438"),
        ]

        self.nav_buttons = {}
        nav_frame = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        nav_frame.pack(fill="x", pady=(16, 0), padx=8)

        for key, icon, label in nav_items:
            btn = ctk.CTkButton(
                nav_frame, text=f"  {icon}  {label}", anchor="w",
                fg_color="transparent", hover_color=BG_CARD_H,
                text_color=TEXT_S, font=(FONT, 13),
                height=40, corner_radius=8,
                command=lambda k=key: self.show_page(k)
            )
            btn.pack(fill="x", pady=1)
            self.nav_buttons[key] = btn

        # Content area
        self.content = ctk.CTkFrame(main, fg_color=BG_MAIN, corner_radius=0)
        self.content.pack(side="right", fill="both", expand=True)
        self.current_page = None

    # === Navigation ===
    def show_page(self, page):
        for key, btn in self.nav_buttons.items():
            if key == page:
                btn.configure(fg_color=BRAND, text_color="#fff", hover_color=BRAND_H)
            else:
                btn.configure(fg_color="transparent", text_color=TEXT_S, hover_color=BG_CARD_H)
        for w in self.content.winfo_children():
            w.destroy()
        self.current_page = page
        pages = {
            "dashboard": self._page_dashboard,
            "users":     self._page_users,
            "premium":   self._page_premium,
            "tools":     self._page_tools,
            "settings":  self._page_settings,
        }
        pages.get(page, self._page_dashboard)()

    # === UI Helpers ===
    def _header(self, parent, title, subtitle=""):
        f = ctk.CTkFrame(parent, fg_color="transparent")
        f.pack(fill="x", padx=24, pady=(20, 4))
        ctk.CTkLabel(f, text=title, font=(FONT, 20, "bold"), text_color=TEXT_W).pack(anchor="w")
        if subtitle:
            ctk.CTkLabel(f, text=subtitle, font=(FONT, 12), text_color=TEXT_D).pack(anchor="w", pady=(2, 0))
        return f

    def _card(self, parent, **kwargs):
        c = ctk.CTkFrame(parent, fg_color=BG_CARD, corner_radius=12, border_width=1, border_color=BORDER, **kwargs)
        return c

    def _toast(self, msg, color=GREEN):
        t = ctk.CTkFrame(self.content, fg_color=color, corner_radius=8)
        t.place(relx=0.5, rely=0.96, anchor="center")
        ctk.CTkLabel(t, text=f"  {msg}  ", text_color="white", font=(FONT, 12, "bold")).pack(padx=16, pady=6)
        self.after(2500, t.destroy)

    def _confirm(self, title, message, on_confirm):
        d = ctk.CTkToplevel(self)
        d.title(title)
        d.geometry("420x200")
        d.configure(fg_color=BG_MAIN)
        d.transient(self)
        d.grab_set()
        d.resizable(False, False)
        ctk.CTkLabel(d, text="\u26a0\ufe0f", font=("Segoe UI Emoji", 32)).pack(pady=(16, 4))
        ctk.CTkLabel(d, text=message, font=(FONT, 13), text_color=TEXT_W, wraplength=380).pack(pady=(0, 16))
        bf = ctk.CTkFrame(d, fg_color="transparent")
        bf.pack(pady=4)
        ctk.CTkButton(bf, text="\u041e\u0442\u043c\u0435\u043d\u0430", fg_color=BG_CARD, hover_color=BG_CARD_H,
                       width=120, corner_radius=8, command=d.destroy).pack(side="left", padx=6)
        def do():
            d.destroy()
            on_confirm()
        ctk.CTkButton(bf, text="\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c", fg_color=RED, hover_color=RED_H,
                       width=120, corner_radius=8, command=do).pack(side="left", padx=6)

    def _set_status(self, ok):
        if ok:
            self.status_pill.configure(text="\u25cf \u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u043e", text_color=GREEN)
        else:
            self.status_pill.configure(text="\u25cf \u041e\u0448\u0438\u0431\u043a\u0430", text_color=RED)

    def _stat_card(self, parent, icon, label, value, color):
        card = self._card(parent)
        card.configure(height=100)
        inner = ctk.CTkFrame(card, fg_color="transparent")
        inner.pack(fill="both", expand=True, padx=16, pady=12)

        top_row = ctk.CTkFrame(inner, fg_color="transparent")
        top_row.pack(fill="x")
        ctk.CTkLabel(top_row, text=icon, font=("Segoe UI Emoji", 20)).pack(side="left")
        ctk.CTkLabel(top_row, text=label, font=(FONT, 12), text_color=TEXT_D).pack(side="left", padx=(8, 0))

        ctk.CTkLabel(inner, text=str(value), font=(FONT, 28, "bold"), text_color=color).pack(anchor="w", pady=(4, 0))
        return card

    # ====================================================================
    #  DASHBOARD
    # ====================================================================
    def _page_dashboard(self):
        self._header(self.content, "\u0413\u043b\u0430\u0432\u043d\u0430\u044f \u043f\u0430\u043d\u0435\u043b\u044c", "\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430 \u0438 \u043e\u0431\u0437\u043e\u0440 \u0441\u0438\u0441\u0442\u0435\u043c\u044b")

        # Stats grid
        self.stats_frame = ctk.CTkFrame(self.content, fg_color="transparent")
        self.stats_frame.pack(fill="x", padx=24, pady=(12, 8))

        self.stats_loading = ctk.CTkLabel(self.stats_frame, text="\u23f3 \u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0438...",
                                          font=(FONT, 13), text_color=TEXT_D)
        self.stats_loading.pack(pady=30)

        # Quick actions
        qa_header = ctk.CTkFrame(self.content, fg_color="transparent")
        qa_header.pack(fill="x", padx=24, pady=(12, 4))
        ctk.CTkLabel(qa_header, text="\u0411\u044b\u0441\u0442\u0440\u044b\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f", font=(FONT, 14, "bold"), text_color=TEXT_W).pack(anchor="w")

        qa_frame = ctk.CTkFrame(self.content, fg_color="transparent")
        qa_frame.pack(fill="x", padx=24, pady=(4, 8))

        actions = [
            ("\U0001f504 \u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c", BRAND, BRAND_H, lambda: self.show_page("dashboard")),
            ("\U0001f465 \u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438", BLUE, "#2563eb", lambda: self.show_page("users")),
            ("\u2b50 Premium", GOLD, "#d4a800", lambda: self.show_page("premium")),
            ("\U0001f527 \u0418\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u044b", ORANGE, "#ea580c", lambda: self.show_page("tools")),
        ]
        for i, (text, fg, hover, cmd) in enumerate(actions):
            btn = ctk.CTkButton(qa_frame, text=text, fg_color=fg, hover_color=hover,
                                width=160, height=38, corner_radius=8, font=(FONT, 12, "bold"), command=cmd)
            btn.grid(row=0, column=i, padx=4, pady=4)

        # Server info card
        info_card = self._card(self.content)
        info_card.pack(fill="x", padx=24, pady=(8, 16))
        info_inner = ctk.CTkFrame(info_card, fg_color="transparent")
        info_inner.pack(fill="x", padx=16, pady=12)
        ctk.CTkLabel(info_inner, text="\U0001f310 \u0421\u0435\u0440\u0432\u0435\u0440", font=(FONT, 13, "bold"), text_color=TEXT_W).pack(anchor="w")
        self.server_info_lbl = ctk.CTkLabel(info_inner, text=f"\u25b8 {self.server_url}",
                                            font=(FONT_MONO, 11), text_color=CYAN)
        self.server_info_lbl.pack(anchor="w", pady=(4, 0))

        def fetch():
            return self.api_get("/api/admin/stats")

        def render(data):
            for w in self.stats_frame.winfo_children():
                w.destroy()

            if isinstance(data, dict) and "_error" in data:
                ctk.CTkLabel(self.stats_frame, text=f"\u274c {data['_error']}",
                             text_color=RED, wraplength=500, font=(FONT, 12)).pack(pady=20)
                self._set_status(False)
                return

            self._set_status(True)
            items = [
                ("\U0001f465", "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438", data.get("users", 0), BRAND_L),
                ("\U0001f4ac", "\u0427\u0430\u0442\u044b", data.get("chats", 0), BLUE),
                ("\u2709\ufe0f", "\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f", data.get("messages", 0), GREEN),
                ("\U0001f4e1", "\u0421\u0435\u0441\u0441\u0438\u0438", data.get("sessions", 0), YELLOW),
                ("\U0001f514", "Push", data.get("pushSubs", 0), ORANGE),
            ]
            for i, (icon, label, val, color) in enumerate(items):
                c = self._stat_card(self.stats_frame, icon, label, val, color)
                c.grid(row=0, column=i, padx=4, pady=4, sticky="nsew")
                self.stats_frame.grid_columnconfigure(i, weight=1)

        self._run_async(fetch, render)

    # ====================================================================
    #  USERS
    # ====================================================================
    def _page_users(self):
        self._header(self.content, "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438", "\u0423\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430\u043c\u0438")

        # Toolbar
        toolbar = ctk.CTkFrame(self.content, fg_color="transparent")
        toolbar.pack(fill="x", padx=24, pady=(8, 4))

        self.user_search_var = ctk.StringVar()
        search_entry = ctk.CTkEntry(toolbar, width=260, height=34, placeholder_text="\U0001f50d \u041f\u043e\u0438\u0441\u043a \u043f\u043e \u0438\u043c\u0435\u043d\u0438...",
                                    textvariable=self.user_search_var, fg_color=BG_INPUT, border_color=BORDER,
                                    font=(FONT, 12))
        search_entry.pack(side="left")
        self.user_search_var.trace_add("write", lambda *_: self._filter_users())

        ctk.CTkButton(toolbar, text="\U0001f504 \u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c", fg_color=BRAND, hover_color=BRAND_H,
                       width=120, height=34, corner_radius=8, font=(FONT, 12),
                       command=lambda: self.show_page("users")).pack(side="right")

        self.users_count_lbl = ctk.CTkLabel(toolbar, text="", font=(FONT, 12), text_color=TEXT_D)
        self.users_count_lbl.pack(side="right", padx=12)

        # Users table
        card = self._card(self.content)
        card.pack(fill="both", expand=True, padx=24, pady=(4, 16))

        self.users_scroll = ctk.CTkScrollableFrame(card, fg_color="transparent")
        self.users_scroll.pack(fill="both", expand=True, padx=4, pady=4)

        # Header
        hdr = ctk.CTkFrame(self.users_scroll, fg_color=BG_HEADER, corner_radius=6, height=36)
        hdr.pack(fill="x", pady=(0, 4))
        hdr.pack_propagate(False)
        for text, w in [("#", 35), ("\u0418\u043c\u044f", 150), ("@username", 130), ("\u0420\u043e\u043b\u044c", 100), ("\u0411\u0438\u043e", 140), ("\u0414\u0430\u0442\u0430", 90), ("\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044f", 150)]:
            ctk.CTkLabel(hdr, text=text, font=(FONT, 11, "bold"), text_color=TEXT_D, width=w, anchor="w").pack(side="left", padx=2)

        self.users_rows_frame = ctk.CTkFrame(self.users_scroll, fg_color="transparent")
        self.users_rows_frame.pack(fill="both", expand=True)

        ctk.CTkLabel(self.users_rows_frame, text="\u23f3 \u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...", text_color=TEXT_D, font=(FONT, 13)).pack(pady=30)

        def fetch():
            return self.api_get("/api/admin/users")

        def render(users):
            if isinstance(users, dict) and "_error" in users:
                for w in self.users_rows_frame.winfo_children(): w.destroy()
                ctk.CTkLabel(self.users_rows_frame, text=f"\u274c {users['_error']}", text_color=RED).pack(pady=20)
                self._set_status(False)
                return
            self._set_status(True)
            self._users_cache = users or []
            self.users_count_lbl.configure(text=f"\u0412\u0441\u0435\u0433\u043e: {len(self._users_cache)}")
            self._render_users(self._users_cache)

        self._run_async(fetch, render)

    def _filter_users(self):
        q = self.user_search_var.get().lower().strip()
        if not q:
            self._render_users(self._users_cache)
        else:
            filtered = [u for u in self._users_cache
                        if q in (u.get("displayName") or "").lower()
                        or q in (u.get("username") or "").lower()]
            self._render_users(filtered)

    def _render_users(self, users):
        for w in self.users_rows_frame.winfo_children():
            w.destroy()

        if not users:
            ctk.CTkLabel(self.users_rows_frame, text="\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e",
                         text_color=TEXT_D, font=(FONT, 13)).pack(pady=30)
            return

        for i, u in enumerate(users, 1):
            bg = BG_CARD_H if i % 2 == 0 else "transparent"
            row = ctk.CTkFrame(self.users_rows_frame, fg_color=bg, corner_radius=6, height=40)
            row.pack(fill="x", pady=1)
            row.pack_propagate(False)

            ctk.CTkLabel(row, text=str(i), font=(FONT, 11), text_color=TEXT_D, width=35, anchor="w").pack(side="left", padx=(8, 2))

            name = (u.get("displayName") or "\u2014")[:18]
            ctk.CTkLabel(row, text=name, font=(FONT, 12, "bold"), text_color=TEXT_W, width=150, anchor="w").pack(side="left", padx=2)

            uname = "@" + (u.get("username") or "")[:14]
            ctk.CTkLabel(row, text=uname, font=(FONT, 11), text_color=CYAN, width=130, anchor="w").pack(side="left", padx=2)

            # Role
            if u.get("superUser"):
                role_text, role_color = "\U0001f451 Super", GOLD
            elif u.get("premium"):
                role_text, role_color = "\u2b50 Premium", BRAND_L
            else:
                role_text, role_color = "\u2014", TEXT_D
            ctk.CTkLabel(row, text=role_text, font=(FONT, 11, "bold"), text_color=role_color, width=100, anchor="w").pack(side="left", padx=2)

            bio = (u.get("bio") or "\u2014")[:20]
            ctk.CTkLabel(row, text=bio, font=(FONT, 10), text_color=TEXT_D, width=140, anchor="w").pack(side="left", padx=2)

            created = (u.get("createdAt") or "")[:10]
            ctk.CTkLabel(row, text=created, font=(FONT, 10), text_color=TEXT_D, width=90, anchor="w").pack(side="left", padx=2)

            uid = u["_id"]
            btns_f = ctk.CTkFrame(row, fg_color="transparent")
            btns_f.pack(side="right", padx=6)

            su_fg = GOLD if u.get("superUser") else BG_CARD
            ctk.CTkButton(btns_f, text="\U0001f451", width=32, height=28, font=("Segoe UI Emoji", 12),
                           fg_color=su_fg, hover_color=GOLD, corner_radius=6, border_width=1,
                           border_color=BORDER if not u.get("superUser") else GOLD,
                           command=lambda uid=uid: self._toggle_su(uid)).pack(side="left", padx=1)

            pr_fg = BRAND if u.get("premium") else BG_CARD
            ctk.CTkButton(btns_f, text="\u2b50", width=32, height=28, font=("Segoe UI Emoji", 12),
                           fg_color=pr_fg, hover_color=BRAND, corner_radius=6, border_width=1,
                           border_color=BORDER if not u.get("premium") else BRAND,
                           command=lambda uid=uid: self._toggle_premium_user(uid)).pack(side="left", padx=1)

            ctk.CTkButton(btns_f, text="\U0001f39b\ufe0f", width=32, height=28, font=("Segoe UI Emoji", 12),
                           fg_color=BG_CARD, hover_color=BRAND_L, corner_radius=6, border_width=1,
                           border_color=BORDER,
                           command=lambda uid=uid, uu=u: self._show_features(uid, uu)).pack(side="left", padx=1)

            ctk.CTkButton(btns_f, text="\u2716", width=32, height=28, font=(FONT, 12),
                           fg_color=BG_CARD, hover_color=RED, corner_radius=6, border_width=1,
                           border_color=BORDER, text_color=RED,
                           command=lambda uid=uid, nm=name: self._delete_user(uid, nm)).pack(side="left", padx=1)

    def _toggle_su(self, uid):
        def do():
            return self.api_put(f"/api/admin/users/{uid}/superuser")
        def done(r):
            if isinstance(r, dict) and "_error" not in r:
                st = "SuperUser \u0412\u041a\u041b" if r.get("superUser") else "SuperUser \u0412\u042b\u041a\u041b"
                self._toast(f"{r.get('username', '?')} \u2192 {st}", GOLD if r.get("superUser") else TEXT_D)
            else:
                self._toast(f"\u041e\u0448\u0438\u0431\u043a\u0430: {r.get('_error', '?')}", RED)
            self.show_page("users")
        self._run_async(do, done)

    def _toggle_premium_user(self, uid):
        def do():
            return self.api_put(f"/api/admin/users/{uid}/premium")
        def done(r):
            if isinstance(r, dict) and "_error" not in r:
                st = "Premium \u0412\u041a\u041b" if r.get("premium") else "Premium \u0412\u042b\u041a\u041b"
                self._toast(f"{r.get('username', '?')} \u2192 {st}", BRAND if r.get("premium") else TEXT_D)
            else:
                self._toast(f"\u041e\u0448\u0438\u0431\u043a\u0430: {r.get('_error', '?')}", RED)
            self.show_page("users")
        self._run_async(do, done)

    def _delete_user(self, uid, name):
        def do_del():
            def do():
                return self.api_delete(f"/api/admin/users/{uid}")
            def done(r):
                if isinstance(r, dict) and "_error" not in r:
                    self._toast(f"\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c {name} \u0443\u0434\u0430\u043b\u0451\u043d")
                else:
                    self._toast(f"\u041e\u0448\u0438\u0431\u043a\u0430: {r.get('_error', '?')}", RED)
                self.show_page("users")
            self._run_async(do, done)
        self._confirm("\u0423\u0434\u0430\u043b\u0435\u043d\u0438\u0435", f"\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f {name}\n\u0438 \u0432\u0441\u0435 \u0435\u0433\u043e \u0434\u0430\u043d\u043d\u044b\u0435?", do_del)

    def _show_features(self, uid, user_data):
        d = ctk.CTkToplevel(self)
        d.title(f"Shadow+ — @{user_data.get('username', '?')}")
        d.geometry("460x440")
        d.configure(fg_color=BG_MAIN)
        d.transient(self)
        d.grab_set()
        d.resizable(False, False)

        ctk.CTkLabel(d, text=f"\U0001f39b\ufe0f  Shadow+ для @{user_data.get('username', '')}",
                     font=(FONT, 15, "bold"), text_color=TEXT_W).pack(pady=(16, 4))
        ctk.CTkLabel(d, text="Управление отдельными Premium-функциями",
                     font=(FONT, 11), text_color=TEXT_D).pack(pady=(0, 12))

        scroll = ctk.CTkScrollableFrame(d, fg_color="transparent", height=260)
        scroll.pack(fill="x", padx=16, pady=(0, 8))

        features = [
            ("premium",          "\u2b50 Premium-статус",     "Общий Premium"),
            ("premiumEmoji",     "\U0001f60e Эмодзи профиля", "Кастомный эмодзи"),
            ("premiumBadge",     "\U0001f396 Значок",         "Значок пользователя"),
            ("premiumNameColor", "\U0001f3a8 Цвет имени",     "Цвет отображаемого имени"),
            ("customStatus",     "\U0001f4ac Статус",         "Текст статуса"),
            ("customStatusEmoji","\U0001f3ad Эмодзи статуса", "Эмодзи рядом со статусом"),
            ("customStatusColor","\U0001f308 Цвет статуса",   "Цвет текста статуса"),
        ]

        entries = {}
        for field, icon, desc in features:
            card = ctk.CTkFrame(scroll, fg_color=BG_CARD, corner_radius=8, border_width=1, border_color=BORDER)
            card.pack(fill="x", pady=2)
            inner = ctk.CTkFrame(card, fg_color="transparent")
            inner.pack(fill="x", padx=10, pady=8)

            ctk.CTkLabel(inner, text=f"{icon}  {desc}", font=(FONT, 11),
                         text_color=TEXT_S, anchor="w").pack(side="left")

            val = user_data.get(field, "")
            if field == "premium":
                var = ctk.BooleanVar(value=bool(val))
                sw = ctk.CTkSwitch(inner, text="", variable=var, onvalue=True, offvalue=False,
                                    progress_color=BRAND, width=40)
                sw.pack(side="right")
                entries[field] = var
            else:
                e = ctk.CTkEntry(inner, width=130, height=28, font=(FONT, 11),
                                  fg_color=BG_INPUT, border_color=BORDER, placeholder_text="—")
                e.pack(side="right")
                if val:
                    e.insert(0, str(val))
                entries[field] = e

        def save():
            data = {}
            for field, widget in entries.items():
                if field == "premium":
                    data[field] = widget.get()
                else:
                    data[field] = widget.get().strip()

            def do():
                return self.api_put(f"/api/admin/users/{uid}/premium-features", data)
            def done(r):
                if isinstance(r, dict) and "_error" not in r:
                    self._toast(f"Функции обновлены для @{user_data.get('username', '?')}")
                    d.destroy()
                    self.show_page("users")
                else:
                    self._toast(f"\u041e\u0448\u0438\u0431\u043a\u0430: {r.get('_error', '?')}", RED)
            self._run_async(do, done)

        bf = ctk.CTkFrame(d, fg_color="transparent")
        bf.pack(pady=8)
        ctk.CTkButton(bf, text="Отмена", fg_color=BG_CARD, hover_color=BG_CARD_H,
                       width=110, corner_radius=8, command=d.destroy).pack(side="left", padx=6)
        ctk.CTkButton(bf, text="\U0001f4be Сохранить", fg_color=BRAND, hover_color=BRAND_H,
                       width=130, corner_radius=8, command=save).pack(side="left", padx=6)

    # ====================================================================
    #  PREMIUM
    # ====================================================================
    def _page_premium(self):
        self._header(self.content, "Premium \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435", "\u0413\u043b\u043e\u0431\u0430\u043b\u044c\u043d\u044b\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u043c\u043e\u043d\u0435\u0442\u0438\u0437\u0430\u0446\u0438\u0438")

        # Status card
        status_card = self._card(self.content)
        status_card.pack(fill="x", padx=24, pady=(12, 8))
        sc_inner = ctk.CTkFrame(status_card, fg_color="transparent")
        sc_inner.pack(fill="x", padx=20, pady=16)

        self.premium_icon_lbl = ctk.CTkLabel(sc_inner, text="\u2b50", font=("Segoe UI Emoji", 28))
        self.premium_icon_lbl.pack(side="left")

        mid = ctk.CTkFrame(sc_inner, fg_color="transparent")
        mid.pack(side="left", padx=16, fill="x", expand=True)
        self.premium_title_lbl = ctk.CTkLabel(mid, text="\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...", font=(FONT, 16, "bold"), text_color=TEXT_W)
        self.premium_title_lbl.pack(anchor="w")
        self.premium_desc_lbl = ctk.CTkLabel(mid, text="", font=(FONT, 12), text_color=TEXT_D)
        self.premium_desc_lbl.pack(anchor="w")

        # Toggle buttons
        btn_frame = ctk.CTkFrame(self.content, fg_color="transparent")
        btn_frame.pack(fill="x", padx=24, pady=(4, 8))

        ctk.CTkButton(btn_frame, text="\u2b50 \u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c (\u043f\u043b\u0430\u0442\u043d\u043e)", fg_color=BRAND, hover_color=BRAND_H,
                       width=220, height=38, corner_radius=8, font=(FONT, 12, "bold"),
                       command=lambda: self._set_premium_global(True)).pack(side="left", padx=(0, 8))

        ctk.CTkButton(btn_frame, text="\u2606 \u041e\u0442\u043a\u043b\u044e\u0447\u0438\u0442\u044c (\u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e)", fg_color=GREEN, hover_color=GREEN_H,
                       width=240, height=38, corner_radius=8, font=(FONT, 12, "bold"),
                       command=lambda: self._set_premium_global(False)).pack(side="left")

        # Info card
        info_card = self._card(self.content)
        info_card.pack(fill="x", padx=24, pady=(8, 8))
        ic_inner = ctk.CTkFrame(info_card, fg_color="transparent")
        ic_inner.pack(fill="x", padx=20, pady=16)

        ctk.CTkLabel(ic_inner, text="\U0001f4cb \u041a\u0430\u043a \u044d\u0442\u043e \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442", font=(FONT, 14, "bold"), text_color=TEXT_W).pack(anchor="w")
        rules = [
            "\u25b8  Premium \u0412\u041a\u041b\u042e\u0427\u0401\u041d \u2014 \u0444\u0443\u043d\u043a\u0446\u0438\u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043e\u0434\u043f\u0438\u0441\u0447\u0438\u043a\u0430\u043c \u0438 Super User",
            "\u25b8  Premium \u041e\u0422\u041a\u041b\u042e\u0427\u0401\u041d \u2014 \u0432\u0441\u0435 \u0444\u0443\u043d\u043a\u0446\u0438\u0438 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u044b \u0434\u043b\u044f \u0432\u0441\u0435\u0445",
            "\u25b8  Super User \u0432\u0441\u0435\u0433\u0434\u0430 \u0438\u043c\u0435\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f \u043a\u043e \u0432\u0441\u0435\u043c \u0444\u0443\u043d\u043a\u0446\u0438\u044f\u043c",
        ]
        for r in rules:
            ctk.CTkLabel(ic_inner, text=r, font=(FONT, 12), text_color=TEXT_S).pack(anchor="w", pady=1)

        # Premium user quick list
        pu_card = self._card(self.content)
        pu_card.pack(fill="both", expand=True, padx=24, pady=(8, 16))
        pu_inner = ctk.CTkFrame(pu_card, fg_color="transparent")
        pu_inner.pack(fill="both", expand=True, padx=16, pady=12)
        ctk.CTkLabel(pu_inner, text="\U0001f451 \u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438 \u0441 \u043e\u0441\u043e\u0431\u044b\u043c\u0438 \u0440\u043e\u043b\u044f\u043c\u0438",
                     font=(FONT, 13, "bold"), text_color=TEXT_W).pack(anchor="w", pady=(0, 6))

        self.premium_users_frame = ctk.CTkFrame(pu_inner, fg_color="transparent")
        self.premium_users_frame.pack(fill="both", expand=True)

        # Load premium status
        def fetch_status():
            return self.api_get("/api/admin/config/premium")

        def render_status(data):
            if isinstance(data, dict) and "_error" not in data:
                enabled = data.get("premiumEnabled", True)
                if enabled:
                    self.premium_title_lbl.configure(text="Premium \u0412\u041a\u041b\u042e\u0427\u0401\u041d")
                    self.premium_desc_lbl.configure(text="\u0424\u0443\u043d\u043a\u0446\u0438\u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043e\u0434\u043f\u0438\u0441\u0447\u0438\u043a\u0430\u043c")
                    self.premium_icon_lbl.configure(text_color=GOLD)
                    self.premium_title_lbl.configure(text_color=GOLD)
                else:
                    self.premium_title_lbl.configure(text="Premium \u041e\u0422\u041a\u041b\u042e\u0427\u0401\u041d")
                    self.premium_desc_lbl.configure(text="\u0412\u0441\u0435 \u0444\u0443\u043d\u043a\u0446\u0438\u0438 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u044b \u0434\u043b\u044f \u0432\u0441\u0435\u0445")
                    self.premium_icon_lbl.configure(text_color=GREEN)
                    self.premium_title_lbl.configure(text_color=GREEN)
                self._set_status(True)
            else:
                self.premium_title_lbl.configure(text="\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438", text_color=RED)
                self._set_status(False)

        self._run_async(fetch_status, render_status)

        # Load premium users
        def fetch_users():
            return self.api_get("/api/admin/users")

        def render_pu_list(users):
            for w in self.premium_users_frame.winfo_children(): w.destroy()
            if isinstance(users, list):
                special = [u for u in users if u.get("superUser") or u.get("premium")]
                if not special:
                    ctk.CTkLabel(self.premium_users_frame, text="\u041d\u0435\u0442 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439 \u0441 \u043e\u0441\u043e\u0431\u044b\u043c\u0438 \u0440\u043e\u043b\u044f\u043c\u0438",
                                 text_color=TEXT_D, font=(FONT, 12)).pack(pady=8)
                    return
                for u in special:
                    f = ctk.CTkFrame(self.premium_users_frame, fg_color=BG_CARD_H, corner_radius=6, height=32)
                    f.pack(fill="x", pady=1)
                    f.pack_propagate(False)
                    role = "\U0001f451 Super" if u.get("superUser") else "\u2b50 Premium"
                    color = GOLD if u.get("superUser") else BRAND_L
                    emoji = u.get("premiumEmoji", "")
                    badge = u.get("premiumBadge", "")
                    extras = f"  {emoji}" if emoji else ""
                    extras += f"  [{badge}]" if badge else ""
                    ctk.CTkLabel(f, text=f"{role}  {u.get('displayName', '?')}{extras}",
                                 font=(FONT, 12), text_color=color).pack(side="left", padx=12)
                    ctk.CTkLabel(f, text=f"@{u.get('username', '')}",
                                 font=(FONT, 11), text_color=TEXT_D).pack(side="right", padx=12)

        self._run_async(fetch_users, render_pu_list)

    def _set_premium_global(self, enabled):
        def do():
            return self.api_put("/api/admin/config/premium", {"enabled": enabled})
        def done(r):
            if isinstance(r, dict) and "_error" not in r:
                if enabled:
                    self._toast("Premium \u0412\u041a\u041b\u042e\u0427\u0401\u041d \u2014 \u043f\u043b\u0430\u0442\u043d\u043e", GOLD)
                else:
                    self._toast("Premium \u041e\u0422\u041a\u041b\u042e\u0427\u0401\u041d \u2014 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e", GREEN)
            else:
                self._toast(f"\u041e\u0448\u0438\u0431\u043a\u0430: {r.get('_error', '?')}", RED)
            self.show_page("premium")
        self._run_async(do, done)

    # ====================================================================
    #  TOOLS (Cleanup + Reset)
    # ====================================================================
    def _page_tools(self):
        self._header(self.content, "\u0418\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u044b", "\u041e\u0447\u0438\u0441\u0442\u043a\u0430 \u0434\u0430\u043d\u043d\u044b\u0445 \u0438 \u0441\u0431\u0440\u043e\u0441 \u0431\u0430\u0437\u044b")

        # Cleanup section
        cleanup_header = ctk.CTkFrame(self.content, fg_color="transparent")
        cleanup_header.pack(fill="x", padx=24, pady=(12, 4))
        ctk.CTkLabel(cleanup_header, text="\U0001f9f9 \u041e\u0447\u0438\u0441\u0442\u043a\u0430", font=(FONT, 15, "bold"), text_color=TEXT_W).pack(anchor="w")

        cleanup_items = [
            ("\u2709\ufe0f  \u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0432\u0441\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f",
             "\u0412\u0441\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f \u0431\u0443\u0434\u0443\u0442 \u0443\u0434\u0430\u043b\u0435\u043d\u044b \u0431\u0435\u0437\u0432\u043e\u0437\u0432\u0440\u0430\u0442\u043d\u043e",
             "/api/admin/messages", "deleted", ORANGE),
            ("\U0001f4ac  \u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0432\u0441\u0435 \u0447\u0430\u0442\u044b",
             "\u0412\u0441\u0435 \u0447\u0430\u0442\u044b \u0438 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f \u0431\u0443\u0434\u0443\u0442 \u0443\u0434\u0430\u043b\u0435\u043d\u044b",
             "/api/admin/chats", "deletedChats", RED),
            ("\U0001f4e1  \u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u0441\u0435\u0441\u0441\u0438\u0438",
             "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u043d\u0435\u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u0441\u0435\u0441\u0441\u0438\u0438",
             "/api/admin/sessions", "deleted", YELLOW),
            ("\U0001f514  \u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c push-\u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0438",
             "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0432\u0441\u0435 push-\u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0438",
             "/api/admin/pushsubs", "deleted", CYAN),
        ]

        for label, confirm_msg, endpoint, count_key, color in cleanup_items:
            card = self._card(self.content)
            card.pack(fill="x", padx=24, pady=2)
            row = ctk.CTkFrame(card, fg_color="transparent")
            row.pack(fill="x", padx=16, pady=10)
            ctk.CTkLabel(row, text=label, font=(FONT, 13), text_color=TEXT_W).pack(side="left")

            def make_cmd(ep=endpoint, cm=confirm_msg, ck=count_key):
                def cmd():
                    def do_clean():
                        def do():
                            return self.api_delete(ep)
                        def done(r):
                            if isinstance(r, dict) and "_error" not in r:
                                cnt = r.get(ck, 0)
                                self._toast(f"\u0423\u0434\u0430\u043b\u0435\u043d\u043e: {cnt}")
                            else:
                                self._toast(f"\u041e\u0448\u0438\u0431\u043a\u0430: {r.get('_error', '?')}", RED)
                        self._run_async(do, done)
                    self._confirm("\u041e\u0447\u0438\u0441\u0442\u043a\u0430", cm, do_clean)
                return cmd

            ctk.CTkButton(row, text="\u0412\u044b\u043f\u043e\u043b\u043d\u0438\u0442\u044c", fg_color=color, hover_color=RED_H,
                           width=110, height=30, corner_radius=6, font=(FONT, 11, "bold"),
                           command=make_cmd()).pack(side="right")

        # Reset section
        sep = ctk.CTkFrame(self.content, height=1, fg_color=BORDER)
        sep.pack(fill="x", padx=24, pady=(16, 8))

        reset_header = ctk.CTkFrame(self.content, fg_color="transparent")
        reset_header.pack(fill="x", padx=24, pady=(4, 4))
        ctk.CTkLabel(reset_header, text="\u26a0\ufe0f \u041e\u043f\u0430\u0441\u043d\u0430\u044f \u0437\u043e\u043d\u0430", font=(FONT, 15, "bold"), text_color=RED).pack(anchor="w")

        reset_card = self._card(self.content)
        reset_card.configure(border_color="#3b1010")
        reset_card.pack(fill="x", padx=24, pady=(4, 16))
        rc_inner = ctk.CTkFrame(reset_card, fg_color="transparent")
        rc_inner.pack(fill="x", padx=20, pady=16)

        ctk.CTkLabel(rc_inner,
                     text="\u041f\u043e\u043b\u043d\u044b\u0439 \u0441\u0431\u0440\u043e\u0441 \u0443\u0434\u0430\u043b\u044f\u0435\u0442 \u0412\u0421\u0415 \u0434\u0430\u043d\u043d\u044b\u0435:\n"
                          "\u2022 \u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439, \u0447\u0430\u0442\u044b, \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f\n"
                          "\u2022 \u0421\u0435\u0441\u0441\u0438\u0438, push-\u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0438\n\n"
                          "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u043d\u0435\u0432\u043e\u0437\u043c\u043e\u0436\u043d\u043e!",
                     font=(FONT, 12), text_color=ORANGE, wraplength=500, justify="left").pack(anchor="w", pady=(0, 12))

        reset_row = ctk.CTkFrame(rc_inner, fg_color="transparent")
        reset_row.pack(fill="x")
        ctk.CTkLabel(reset_row, text="\u0412\u0432\u0435\u0434\u0438\u0442\u0435 RESET:", font=(FONT, 12), text_color=TEXT_D).pack(side="left")
        self.reset_entry = ctk.CTkEntry(reset_row, width=120, height=34, placeholder_text="RESET",
                                        fg_color=BG_INPUT, border_color=BORDER, font=(FONT_MONO, 13))
        self.reset_entry.pack(side="left", padx=8)

        def do_reset():
            if self.reset_entry.get().strip() != "RESET":
                self._toast("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 RESET \u0434\u043b\u044f \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f", YELLOW)
                return
            def _do():
                return self.api_delete("/api/admin/reset")
            def _done(r):
                if isinstance(r, dict) and "_error" not in r:
                    total = sum(v for k, v in r.items() if k.startswith("deleted") and isinstance(v, int))
                    self._toast(f"\u0411\u0414 \u043e\u0447\u0438\u0449\u0435\u043d\u0430! \u0423\u0434\u0430\u043b\u0435\u043d\u043e: {total}")
                else:
                    self._toast(f"\u041e\u0448\u0438\u0431\u043a\u0430: {r.get('_error', '?')}", RED)
                self.reset_entry.delete(0, "end")
            self._run_async(_do, _done)

        ctk.CTkButton(reset_row, text="\u26a0\ufe0f \u0421\u0411\u0420\u041e\u0421", fg_color=RED, hover_color=RED_H,
                       width=120, height=34, corner_radius=8, font=(FONT, 12, "bold"),
                       command=do_reset).pack(side="left")

    # ====================================================================
    #  SETTINGS
    # ====================================================================
    def _page_settings(self):
        self._header(self.content, "\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438", "\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435 \u043a \u0441\u0435\u0440\u0432\u0435\u0440\u0443")

        card = self._card(self.content)
        card.pack(fill="x", padx=24, pady=(12, 8))
        inner = ctk.CTkFrame(card, fg_color="transparent")
        inner.pack(fill="x", padx=20, pady=20)

        # Server URL
        ctk.CTkLabel(inner, text="URL \u0441\u0435\u0440\u0432\u0435\u0440\u0430", font=(FONT, 12, "bold"), text_color=TEXT_S).pack(anchor="w", pady=(0, 4))
        self.url_entry = ctk.CTkEntry(inner, width=460, height=38, font=(FONT_MONO, 12),
                                      fg_color=BG_INPUT, border_color=BORDER)
        self.url_entry.pack(anchor="w", pady=(0, 16))
        self.url_entry.insert(0, self.server_url)

        # Admin key
        ctk.CTkLabel(inner, text="Admin Key", font=(FONT, 12, "bold"), text_color=TEXT_S).pack(anchor="w", pady=(0, 4))
        self.key_entry = ctk.CTkEntry(inner, width=460, height=38, font=(FONT_MONO, 12), show="\u2022",
                                      fg_color=BG_INPUT, border_color=BORDER)
        self.key_entry.pack(anchor="w", pady=(0, 6))
        self.key_entry.insert(0, self.admin_key)

        self.show_key_var = ctk.BooleanVar(value=False)
        ctk.CTkCheckBox(inner, text="\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u043a\u043b\u044e\u0447", variable=self.show_key_var,
                         font=(FONT, 12), text_color=TEXT_D,
                         command=lambda: self.key_entry.configure(show="" if self.show_key_var.get() else "\u2022")
                         ).pack(anchor="w", pady=(0, 20))

        # Buttons
        btn_row = ctk.CTkFrame(inner, fg_color="transparent")
        btn_row.pack(anchor="w")

        def save():
            new_url = self.url_entry.get().strip().rstrip("/")
            new_key = self.key_entry.get().strip()
            if new_url:
                self.server_url = new_url
            if new_key:
                self.admin_key = new_key
            if hasattr(self, 'server_info_lbl'):
                self.server_info_lbl.configure(text=f"\u25b8 {self.server_url}")
            self._toast("\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b")

        def test():
            save()
            def do():
                return self.api_get("/api/admin/stats")
            def done(r):
                if isinstance(r, dict) and "_error" not in r:
                    self._toast(f"\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u043e! \u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439: {r.get('users', 0)}", GREEN)
                    self._set_status(True)
                else:
                    self._toast(f"\u041e\u0448\u0438\u0431\u043a\u0430: {r.get('_error', '?')}", RED)
                    self._set_status(False)
            self._run_async(do, done)

        ctk.CTkButton(btn_row, text="\U0001f4be \u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c", fg_color=BRAND, hover_color=BRAND_H,
                       width=140, height=36, corner_radius=8, font=(FONT, 12, "bold"),
                       command=save).pack(side="left", padx=(0, 8))
        ctk.CTkButton(btn_row, text="\U0001f50c \u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c", fg_color=BLUE, hover_color="#2563eb",
                       width=160, height=36, corner_radius=8, font=(FONT, 12, "bold"),
                       command=test).pack(side="left")

        # About
        about_card = self._card(self.content)
        about_card.pack(fill="x", padx=24, pady=(16, 16))
        ab_inner = ctk.CTkFrame(about_card, fg_color="transparent")
        ab_inner.pack(fill="x", padx=20, pady=16)

        ctk.CTkLabel(ab_inner, text="\U0001f30c Shadow Messenger Admin Panel", font=(FONT, 14, "bold"), text_color=BRAND_L).pack(anchor="w")
        ctk.CTkLabel(ab_inner, text="\u0412\u0435\u0440\u0441\u0438\u044f 4.0  \u2022  CustomTkinter  \u2022  Python",
                     font=(FONT, 11), text_color=TEXT_D).pack(anchor="w", pady=(4, 0))


if __name__ == "__main__":
    app = AdminApp()
    app.mainloop()
