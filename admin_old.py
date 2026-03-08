#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Shadow Messenger 🌑 Admin Panel v3.0 (CustomTkinter GUI)
import os
import sys
import subprocess
import threading

# 📦 Авто-установка зависимостей
def ensure_package(name, pip_name=None):
    try:
        __import__(name)
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name or name])

ensure_package("requests")
ensure_package("customtkinter")

import requests
import customtkinter as ctk

# ⚙️ Конфигурация
DEFAULT_URL = "https://shadow-mess.onrender.com"
DEFAULT_KEY = "shadow_admin_secret_2026"

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

# 🎨 Палитра
PURPLE = "#7c3aed"
PURPLE_H = "#6d28d9"
DARK_BG = "#0f0f1a"
CARD_BG = "#16213e"
SIDEBAR_BG = "#111128"
TEXT = "#e2e8f0"
TEXT_DIM = "#94a3b8"
RED = "#ef4444"
GREEN = "#22c55e"
YELLOW = "#eab308"
ORANGE = "#f97316"
BLUE = "#3b82f6"
CYAN = "#06b6d4"
GOLD = "#ffd700"
ACCENT = "#8b5cf6"
ROW_ALT = "#1e293b"


class AdminApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Shadow Messenger \u25c6 Admin Panel")
        self.geometry("1040x700")
        self.minsize(880, 560)
        self.configure(fg_color=DARK_BG)

        self.server_url = os.environ.get("SHADOW_SERVER", DEFAULT_URL)
        self.admin_key = os.environ.get("SHADOW_ADMIN_KEY", DEFAULT_KEY)

        self._build_ui()
        self.show_page("stats")

    # ─── Headers ─────────────────────────
    @property
    def headers(self):
        return {"X-Admin-Key": self.admin_key, "Content-Type": "application/json"}

    # ─── API helpers ─────────────────────
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

    # ─── Build UI ────────────────────────
    def _build_ui(self):
        # Sidebar
        self.sidebar = ctk.CTkFrame(self, width=230, fg_color=SIDEBAR_BG, corner_radius=0)
        self.sidebar.pack(side="left", fill="y")
        self.sidebar.pack_propagate(False)

        # Logo area
        logo_f = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        logo_f.pack(fill="x", pady=(24, 6), padx=16)
        ctk.CTkLabel(logo_f, text="\U0001f30c", font=("Segoe UI Emoji", 34)).pack()
        ctk.CTkLabel(logo_f, text="Shadow Admin", font=("Segoe UI", 18, "bold"), text_color=PURPLE).pack()
        ctk.CTkLabel(logo_f, text="v3.0", font=("Segoe UI", 10), text_color=TEXT_DIM).pack()

        sep = ctk.CTkFrame(self.sidebar, height=1, fg_color="#2a2a4a")
        sep.pack(fill="x", padx=20, pady=12)

        # Navigation buttons
        self.nav_buttons = {}
        nav_items = [
            ("stats",    "\U0001f4ca  \u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430"),
            ("users",    "\U0001f465  \u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438"),
            ("premium",  "\u2b50  Premium"),
            ("cleanup",  "\U0001f9f9  \u041e\u0447\u0438\u0441\u0442\u043a\u0430"),
            ("reset",    "\u26a0\ufe0f  \u0421\u0431\u0440\u043e\u0441 \u0411\u0414"),
            ("settings", "\u2699\ufe0f  \u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438"),
        ]
        nav_f = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        nav_f.pack(fill="x", pady=4)

        for key, label in nav_items:
            btn = ctk.CTkButton(
                nav_f, text=label, anchor="w",
                fg_color="transparent", hover_color="#2a2a4a",
                text_color=TEXT, font=("Segoe UI", 14),
                height=42, corner_radius=10,
                command=lambda k=key: self.show_page(k)
            )
            btn.pack(fill="x", padx=14, pady=2)
            self.nav_buttons[key] = btn

        # Status indicator at sidebar bottom
        self.status_frame = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        self.status_frame.pack(side="bottom", fill="x", padx=16, pady=14)
        self.status_dot = ctk.CTkLabel(self.status_frame, text="\u25cf", font=("Segoe UI", 12), text_color=RED, width=16)
        self.status_dot.pack(side="left")
        self.status_label = ctk.CTkLabel(self.status_frame, text="\u041d\u0435 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u043e", text_color=TEXT_DIM, font=("Segoe UI", 11), anchor="w")
        self.status_label.pack(side="left", padx=6)

        # Main content
        self.content = ctk.CTkFrame(self, fg_color=DARK_BG, corner_radius=0)
        self.content.pack(side="right", fill="both", expand=True)
        self.current_page = None

    def show_page(self, page_name):
        for key, btn in self.nav_buttons.items():
            if key == page_name:
                btn.configure(fg_color=PURPLE, text_color="#ffffff")
            else:
                btn.configure(fg_color="transparent", text_color=TEXT)
        for w in self.content.winfo_children():
            w.destroy()
        self.current_page = page_name
        pages = {
            "stats": self._page_stats,
            "users": self._page_users,
            "premium": self._page_premium,
            "cleanup": self._page_cleanup,
            "reset": self._page_reset,
            "settings": self._page_settings,
        }
        pages.get(page_name, self._page_stats)()

    # ─── Helpers ─────────────────────────
    def _card(self, parent, **kwargs):
        return ctk.CTkFrame(parent, fg_color=CARD_BG, corner_radius=14, **kwargs)

    def _title(self, parent, text, icon=""):
        f = ctk.CTkFrame(parent, fg_color="transparent")
        f.pack(fill="x", padx=28, pady=(24, 10))
        ctk.CTkLabel(f, text=f"{icon}  {text}", font=("Segoe UI", 22, "bold"), text_color=TEXT).pack(anchor="w")
        return f

    def _toast(self, msg, color=GREEN):
        t = ctk.CTkFrame(self.content, fg_color=color, corner_radius=10)
        t.place(relx=0.5, rely=0.95, anchor="center")
        ctk.CTkLabel(t, text=f"  {msg}  ", text_color="white", font=("Segoe UI", 12, "bold")).pack(padx=18, pady=8)
        self.after(3000, t.destroy)

    def _run_async(self, func, callback):
        def worker():
            result = func()
            self.after(0, lambda: callback(result))
        threading.Thread(target=worker, daemon=True).start()

    def _confirm(self, title, message, on_confirm):
        d = ctk.CTkToplevel(self)
        d.title(title)
        d.geometry("440x210")
        d.configure(fg_color=DARK_BG)
        d.transient(self)
        d.grab_set()
        d.resizable(False, False)
        ctk.CTkLabel(d, text="\u26a0\ufe0f", font=("Segoe UI Emoji", 36)).pack(pady=(16, 4))
        ctk.CTkLabel(d, text=message, font=("Segoe UI", 14), text_color=TEXT, wraplength=400).pack(pady=(0, 16))
        bf = ctk.CTkFrame(d, fg_color="transparent")
        bf.pack(pady=4)
        ctk.CTkButton(bf, text="\u041e\u0442\u043c\u0435\u043d\u0430", fg_color="#404060", hover_color="#505080",
                       width=130, corner_radius=10, command=d.destroy).pack(side="left", padx=8)
        def do():
            d.destroy()
            on_confirm()
        ctk.CTkButton(bf, text="\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c", fg_color=RED, hover_color="#dc2626",
                       width=130, corner_radius=10, command=do).pack(side="left", padx=8)

    def _set_status(self, ok):
        if ok:
            self.status_dot.configure(text_color=GREEN)
            self.status_label.configure(text="\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u043e", text_color=GREEN)
        else:
            self.status_dot.configure(text_color=RED)
            self.status_label.configure(text="\u041e\u0448\u0438\u0431\u043a\u0430", text_color=RED)

    # ══════════════════════════════════════
    #  STATS PAGE
    # ══════════════════════════════════════
    def _page_stats(self):
        self._title(self.content, "\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430 \u0431\u0430\u0437\u044b \u0434\u0430\u043d\u043d\u044b\u0445", "\U0001f4ca")
        card = self._card(self.content)
        card.pack(fill="both", expand=True, padx=28, pady=12)
        self.stats_inner = ctk.CTkFrame(card, fg_color="transparent")
        self.stats_inner.pack(fill="both", expand=True, padx=24, pady=24)
        ctk.CTkLabel(self.stats_inner, text="\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...", text_color=TEXT_DIM, font=("Segoe UI", 14)).pack(pady=40)

        def fetch():
            return self.api_get("/api/admin/stats")

        def render(data):
            for w in self.stats_inner.winfo_children():
                w.destroy()
            if "_error" in (data or {}):
                ctk.CTkLabel(self.stats_inner, text=f"\u041e\u0448\u0438\u0431\u043a\u0430: {data['_error']}", text_color=RED, wraplength=500).pack(pady=20)
                self._set_status(False)
                return
            self._set_status(True)

            items = [
                ("\U0001f465  \u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438", data.get("users", 0), GREEN),
                ("\U0001f4ac  \u0427\u0430\u0442\u044b", data.get("chats", 0), BLUE),
                ("\u2709\ufe0f  \u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f", data.get("messages", 0), CYAN),
                ("\U0001f4e1  \u0421\u0435\u0441\u0441\u0438\u0438", data.get("sessions", 0), YELLOW),
                ("\U0001f514  Push-\u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0438", data.get("pushSubs", 0), ORANGE),
            ]
            max_val = max(data.get("messages", 1), 1)

            for label_text, count, color in items:
                row = ctk.CTkFrame(self.stats_inner, fg_color="#1e1e36", corner_radius=10, height=52)
                row.pack(fill="x", pady=4)
                row.pack_propagate(False)
                ctk.CTkLabel(row, text=label_text, font=("Segoe UI", 14), text_color=TEXT, width=200, anchor="w").pack(side="left", padx=(16, 0))
                bar = ctk.CTkProgressBar(row, width=280, height=16, progress_color=color, fg_color="#2d2d4a", corner_radius=8)
                bar.pack(side="left", padx=(0, 12))
                bar.set(min(count / max_val, 1.0))
                ctk.CTkLabel(row, text=str(count), font=("Segoe UI", 18, "bold"), text_color=color, width=70, anchor="e").pack(side="right", padx=16)

        self._run_async(fetch, render)
        ctk.CTkButton(self.content, text="\U0001f504  \u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c", fg_color=PURPLE, hover_color=PURPLE_H,
                       corner_radius=10, command=lambda: self.show_page("stats")).pack(pady=(0, 18))

    # ══════════════════════════════════════
    #  USERS PAGE
    # ══════════════════════════════════════
    def _page_users(self):
        self._title(self.content, "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438", "\U0001f465")
        ctrl = ctk.CTkFrame(self.content, fg_color="transparent")
        ctrl.pack(fill="x", padx=28, pady=(0, 8))
        ctk.CTkButton(ctrl, text="\U0001f504  \u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c", fg_color=PURPLE, hover_color=PURPLE_H,
                       width=130, corner_radius=10, command=lambda: self.show_page("users")).pack(side="right")

        card = self._card(self.content)
        card.pack(fill="both", expand=True, padx=28, pady=(0, 18))
        self.users_scroll = ctk.CTkScrollableFrame(card, fg_color="transparent")
        self.users_scroll.pack(fill="both", expand=True, padx=10, pady=10)
        ctk.CTkLabel(self.users_scroll, text="\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...", text_color=TEXT_DIM, font=("Segoe UI", 14)).pack(pady=40)

        def fetch():
            return self.api_get("/api/admin/users")

        def render(users):
            for w in self.users_scroll.winfo_children():
                w.destroy()
            if isinstance(users, dict) and "_error" in users:
                ctk.CTkLabel(self.users_scroll, text=f"\u041e\u0448\u0438\u0431\u043a\u0430: {users['_error']}", text_color=RED, wraplength=500).pack(pady=20)
                self._set_status(False)
                return
            self._set_status(True)
            if not users:
                ctk.CTkLabel(self.users_scroll, text="\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439 \u043d\u0435\u0442", text_color=TEXT_DIM).pack(pady=20)
                return

            # Header row
            hdr = ctk.CTkFrame(self.users_scroll, fg_color="transparent")
            hdr.pack(fill="x", pady=(0, 6))
            for text, w in [("#", 30), ("\u0418\u043c\u044f", 140), ("Username", 120), ("\u0420\u043e\u043b\u0438", 110), ("\u0414\u0430\u0442\u0430", 85), ("", 130)]:
                ctk.CTkLabel(hdr, text=text, font=("Segoe UI", 11, "bold"), text_color=TEXT_DIM, width=w, anchor="w").pack(side="left", padx=2)

            for i, u in enumerate(users, 1):
                row_bg = ROW_ALT if i % 2 == 0 else "transparent"
                row = ctk.CTkFrame(self.users_scroll, fg_color=row_bg, corner_radius=8, height=44)
                row.pack(fill="x", pady=1)
                row.pack_propagate(False)

                ctk.CTkLabel(row, text=str(i), font=("Segoe UI", 12), text_color=TEXT_DIM, width=30, anchor="w").pack(side="left", padx=(10, 2))
                name = (u.get("displayName") or "")[:16]
                ctk.CTkLabel(row, text=name, font=("Segoe UI", 12, "bold"), text_color=TEXT, width=140, anchor="w").pack(side="left", padx=2)
                uname = "@" + (u.get("username") or "")[:13]
                ctk.CTkLabel(row, text=uname, font=("Segoe UI", 12), text_color=CYAN, width=120, anchor="w").pack(side="left", padx=2)

                roles = ""
                if u.get("superUser"):
                    roles += "\U0001f451 SU  "
                if u.get("premium"):
                    roles += "\u2b50 PR"
                if not roles:
                    roles = "\u2014"
                r_color = GOLD if u.get("superUser") else (PURPLE if u.get("premium") else TEXT_DIM)
                ctk.CTkLabel(row, text=roles.strip(), font=("Segoe UI", 11, "bold"), text_color=r_color, width=110, anchor="w").pack(side="left", padx=2)

                created = u.get("createdAt", "")[:10]
                ctk.CTkLabel(row, text=created, font=("Segoe UI", 11), text_color=TEXT_DIM, width=85, anchor="w").pack(side="left", padx=2)

                uid = u["_id"]
                btns = ctk.CTkFrame(row, fg_color="transparent")
                btns.pack(side="right", padx=8)

                su_fg = GOLD if u.get("superUser") else "#404060"
                ctk.CTkButton(btns, text="\U0001f451", width=36, height=30, font=("Segoe UI Emoji", 14),
                               fg_color=su_fg, hover_color=GOLD, corner_radius=8,
                               command=lambda uid=uid: self._toggle_su(uid)).pack(side="left", padx=2)

                pr_fg = PURPLE if u.get("premium") else "#404060"
                ctk.CTkButton(btns, text="\u2b50", width=36, height=30, font=("Segoe UI Emoji", 14),
                               fg_color=pr_fg, hover_color=PURPLE, corner_radius=8,
                               command=lambda uid=uid: self._toggle_premium_user(uid)).pack(side="left", padx=2)

                ctk.CTkButton(btns, text="\u2716", width=36, height=30, font=("Segoe UI", 14),
                               fg_color="#5a2020", hover_color=RED, corner_radius=8,
                               command=lambda uid=uid, nm=name: self._delete_user(uid, nm)).pack(side="left", padx=2)

        self._run_async(fetch, render)

    def _toggle_su(self, uid):
        def do():
            return self.api_put(f"/api/admin/users/{uid}/superuser")
        def done(r):
            if isinstance(r, dict) and "_error" not in r:
                st = "SuperUser \u0412\u041a\u041b" if r.get("superUser") else "SuperUser \u0412\u042b\u041a\u041b"
                self._toast(f"{r.get('username', '?')} \u2192 {st}", GOLD if r.get("superUser") else TEXT_DIM)
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
                self._toast(f"{r.get('username', '?')} \u2192 {st}", PURPLE if r.get("premium") else TEXT_DIM)
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
        self._confirm("\u0423\u0434\u0430\u043b\u0435\u043d\u0438\u0435", f"\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f {name} \u0438 \u0432\u0441\u0435 \u0435\u0433\u043e \u0434\u0430\u043d\u043d\u044b\u0435?", do_del)

    # ══════════════════════════════════════
    #  PREMIUM PAGE
    # ══════════════════════════════════════
    def _page_premium(self):
        self._title(self.content, "\u0423\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 Premium", "\u2b50")
        card = self._card(self.content)
        card.pack(fill="x", padx=28, pady=12)
        inner = ctk.CTkFrame(card, fg_color="transparent")
        inner.pack(fill="x", padx=24, pady=24)

        ctk.CTkLabel(inner, text="\u0413\u043b\u043e\u0431\u0430\u043b\u044c\u043d\u044b\u0439 Premium", font=("Segoe UI", 17, "bold"), text_color=TEXT).pack(anchor="w")
        ctk.CTkLabel(inner, text="\u041a\u043e\u0433\u0434\u0430 Premium \u043e\u0442\u043a\u043b\u044e\u0447\u0451\u043d \u2014 \u0432\u0441\u0435 \u0444\u0443\u043d\u043a\u0446\u0438\u0438 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u044b.\n"
                     "\u041a\u043e\u0433\u0434\u0430 \u0432\u043a\u043b\u044e\u0447\u0451\u043d \u2014 \u0442\u043e\u043b\u044c\u043a\u043e \u0434\u043b\u044f \u043f\u043e\u0434\u043f\u0438\u0441\u0447\u0438\u043a\u043e\u0432.",
                     font=("Segoe UI", 12), text_color=TEXT_DIM, wraplength=500, justify="left").pack(anchor="w", pady=(6, 14))

        self.premium_status_lbl = ctk.CTkLabel(inner, text="\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...", font=("Segoe UI", 14), text_color=TEXT_DIM)
        self.premium_status_lbl.pack(anchor="w", pady=(0, 12))

        bf = ctk.CTkFrame(inner, fg_color="transparent")
        bf.pack(anchor="w")
        ctk.CTkButton(bf, text="\u2b50 \u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c (\u043f\u043b\u0430\u0442\u043d\u043e)", fg_color=PURPLE, hover_color=PURPLE_H,
                       width=240, corner_radius=10, command=lambda: self._set_premium_global(True)).pack(side="left", padx=(0, 10))
        ctk.CTkButton(bf, text="\u2606 \u041e\u0442\u043a\u043b\u044e\u0447\u0438\u0442\u044c (\u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e)", fg_color=GREEN, hover_color="#16a34a",
                       width=260, corner_radius=10, command=lambda: self._set_premium_global(False)).pack(side="left")

        # Load status
        def fetch():
            return self.api_get("/api/admin/config/premium")
        def render(data):
            if isinstance(data, dict) and "_error" not in data:
                enabled = data.get("premiumEnabled", True)
                if enabled:
                    self.premium_status_lbl.configure(
                        text="\u25cf  Premium \u0412\u041a\u041b\u042e\u0427\u0401\u041d \u2014 \u0442\u043e\u043b\u044c\u043a\u043e \u0434\u043b\u044f \u043f\u043e\u0434\u043f\u0438\u0441\u0447\u0438\u043a\u043e\u0432",
                        text_color=YELLOW
                    )
                else:
                    self.premium_status_lbl.configure(
                        text="\u25cf  Premium \u041e\u0422\u041a\u041b\u042e\u0427\u0401\u041d \u2014 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e \u0434\u043b\u044f \u0432\u0441\u0435\u0445",
                        text_color=GREEN
                    )
                self._set_status(True)
            else:
                self.premium_status_lbl.configure(text="\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438", text_color=RED)
                self._set_status(False)
        self._run_async(fetch, render)

    def _set_premium_global(self, enabled):
        def do():
            return self.api_put("/api/admin/config/premium", {"enabled": enabled})
        def done(r):
            if isinstance(r, dict) and "_error" not in r:
                if enabled:
                    self._toast("Premium \u0412\u041a\u041b\u042e\u0427\u0401\u041d", YELLOW)
                else:
                    self._toast("Premium \u041e\u0422\u041a\u041b\u042e\u0427\u0401\u041d \u2014 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e", GREEN)
            else:
                self._toast(f"\u041e\u0448\u0438\u0431\u043a\u0430: {r.get('_error', '?')}", RED)
            self.show_page("premium")
        self._run_async(do, done)

    # ══════════════════════════════════════
    #  CLEANUP PAGE
    # ══════════════════════════════════════
    def _page_cleanup(self):
        self._title(self.content, "\u041e\u0447\u0438\u0441\u0442\u043a\u0430 \u0434\u0430\u043d\u043d\u044b\u0445", "\U0001f9f9")

        cleanup_items = [
            ("\u2709\ufe0f  \u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0412\u0421\u0415 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f",
             "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0432\u0441\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f \u0438\u0437 \u0431\u0430\u0437\u044b?",
             "/api/admin/messages", "deleted", RED),
            ("\U0001f4ac  \u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0412\u0421\u0415 \u0447\u0430\u0442\u044b",
             "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0432\u0441\u0435 \u0447\u0430\u0442\u044b \u0438 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f?",
             "/api/admin/chats", "deletedChats", RED),
            ("\U0001f4e1  \u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u0441\u0435\u0441\u0441\u0438\u0438",
             "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u043d\u0435\u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u0441\u0435\u0441\u0441\u0438\u0438?",
             "/api/admin/sessions", "deleted", YELLOW),
            ("\U0001f514  \u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c push-\u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0438",
             "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0432\u0441\u0435 push-\u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0438?",
             "/api/admin/pushsubs", "deleted", ORANGE),
        ]

        for label, confirm_msg, endpoint, count_key, color in cleanup_items:
            card = self._card(self.content)
            card.pack(fill="x", padx=28, pady=4)
            row = ctk.CTkFrame(card, fg_color="transparent")
            row.pack(fill="x", padx=18, pady=14)
            ctk.CTkLabel(row, text=label, font=("Segoe UI", 14), text_color=TEXT).pack(side="left")

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

            ctk.CTkButton(row, text="\u0412\u044b\u043f\u043e\u043b\u043d\u0438\u0442\u044c", fg_color=color,
                           hover_color="#dc2626" if color == RED else "#b45309",
                           width=130, corner_radius=10, command=make_cmd()).pack(side="right")

    # ══════════════════════════════════════
    #  RESET PAGE
    # ══════════════════════════════════════
    def _page_reset(self):
        self._title(self.content, "\u041f\u043e\u043b\u043d\u044b\u0439 \u0441\u0431\u0440\u043e\u0441 \u0411\u0414", "\u26a0\ufe0f")
        card = self._card(self.content)
        card.pack(fill="x", padx=28, pady=12)
        inner = ctk.CTkFrame(card, fg_color="transparent")
        inner.pack(fill="x", padx=24, pady=24)
        ctk.CTkLabel(inner, text="\u26a0\ufe0f \u041e\u043f\u0430\u0441\u043d\u0430\u044f \u0437\u043e\u043d\u0430", font=("Segoe UI", 16, "bold"), text_color=RED).pack(anchor="w")
        ctk.CTkLabel(inner, text="\u042d\u0442\u043e \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0443\u0434\u0430\u043b\u0438\u0442 \u0412\u0421\u0415 \u0434\u0430\u043d\u043d\u044b\u0435:\n"
                     "\u2022 \u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438, \u0447\u0430\u0442\u044b, \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f\n"
                     "\u2022 \u0421\u0435\u0441\u0441\u0438\u0438, push-\u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0438\n\n"
                     "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u043d\u0435\u0432\u043e\u0437\u043c\u043e\u0436\u043d\u043e!",
                     font=("Segoe UI", 13), text_color=ORANGE, wraplength=500, justify="left").pack(anchor="w", pady=(8, 16))

        ctk.CTkLabel(inner, text="\u0412\u0432\u0435\u0434\u0438\u0442\u0435 RESET \u0434\u043b\u044f \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f:", font=("Segoe UI", 13), text_color=TEXT_DIM).pack(anchor="w", pady=(0, 4))
        self.reset_entry = ctk.CTkEntry(inner, width=200, height=38, placeholder_text="RESET", fg_color="#1e1e3a", border_color="#3a3a5a")
        self.reset_entry.pack(anchor="w", pady=(0, 14))

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

        ctk.CTkButton(inner, text="\u26a0\ufe0f \u041f\u041e\u041b\u041d\u042b\u0419 \u0421\u0411\u0420\u041e\u0421", fg_color=RED, hover_color="#b91c1c",
                       width=200, height=42, corner_radius=10, font=("Segoe UI", 14, "bold"),
                       command=do_reset).pack(anchor="w")

    # ══════════════════════════════════════
    #  SETTINGS PAGE
    # ══════════════════════════════════════
    def _page_settings(self):
        self._title(self.content, "\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f", "\u2699\ufe0f")
        card = self._card(self.content)
        card.pack(fill="x", padx=28, pady=12)
        inner = ctk.CTkFrame(card, fg_color="transparent")
        inner.pack(fill="x", padx=24, pady=24)

        ctk.CTkLabel(inner, text="URL \u0441\u0435\u0440\u0432\u0435\u0440\u0430", font=("Segoe UI", 12, "bold"), text_color=TEXT_DIM).pack(anchor="w", pady=(0, 4))
        self.url_entry = ctk.CTkEntry(inner, width=420, height=38, font=("Segoe UI", 13), fg_color="#1e1e3a", border_color="#3a3a5a")
        self.url_entry.pack(anchor="w", pady=(0, 14))
        self.url_entry.insert(0, self.server_url)

        ctk.CTkLabel(inner, text="Admin Key", font=("Segoe UI", 12, "bold"), text_color=TEXT_DIM).pack(anchor="w", pady=(0, 4))
        self.key_entry = ctk.CTkEntry(inner, width=420, height=38, font=("Segoe UI", 13), show="\u2022", fg_color="#1e1e3a", border_color="#3a3a5a")
        self.key_entry.pack(anchor="w", pady=(0, 6))
        self.key_entry.insert(0, self.admin_key)

        self.show_key_var = ctk.BooleanVar(value=False)
        ctk.CTkCheckBox(inner, text="\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u043a\u043b\u044e\u0447", variable=self.show_key_var,
                         command=lambda: self.key_entry.configure(show="" if self.show_key_var.get() else "\u2022")).pack(anchor="w", pady=(0, 18))

        bf = ctk.CTkFrame(inner, fg_color="transparent")
        bf.pack(anchor="w")

        def save():
            new_url = self.url_entry.get().strip().rstrip("/")
            new_key = self.key_entry.get().strip()
            if new_url:
                self.server_url = new_url
            if new_key:
                self.admin_key = new_key
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

        ctk.CTkButton(bf, text="\U0001f4be  \u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c", fg_color=PURPLE, hover_color=PURPLE_H,
                       width=150, corner_radius=10, command=save).pack(side="left", padx=(0, 10))
        ctk.CTkButton(bf, text="\U0001f50c  \u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c", fg_color=BLUE, hover_color="#2563eb",
                       width=180, corner_radius=10, command=test).pack(side="left")


if __name__ == "__main__":
    app = AdminApp()
    app.mainloop()
