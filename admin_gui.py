#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Shadow Mess v2.2 — Админ-панель (Beautiful Dark UI)
Tkinter + Canvas-based rounded widgets + gradient accents
"""

import os, sys, json, threading, urllib.request, urllib.error
import tkinter as tk
from tkinter import ttk, messagebox, font as tkfont
import tkinter.simpledialog as sd

# ═════════════════════════════════════════════════════════════
DEFAULT_SERVER = "https://shadow-mess.onrender.com"
ADMIN_KEY      = "shadow_admin_secret_2026"
SERVER         = DEFAULT_SERVER

# ═════════════════════════════════════════════════════════════
# COLORS — Glassmorphism Dark + Neon Accent
# ═════════════════════════════════════════════════════════════
C = {
    "bg":           "#0b0b14",
    "bg2":          "#12121f",
    "bg3":          "#181830",
    "card":         "#15152a",
    "card_border":  "#1e1e3a",
    "card_hover":   "#1d1d38",
    "sidebar":      "#0e0e1c",
    "sidebar_sel":  "#1a1a35",
    "accent":       "#8b5cf6",
    "accent2":      "#a78bfa",
    "accent_glow":  "#7c3aed",
    "green":        "#22c55e",
    "green_dim":    "#16a34a",
    "red":          "#ef4444",
    "red_dim":      "#991b1b",
    "yellow":       "#eab308",
    "blue":         "#3b82f6",
    "text":         "#e8e8f0",
    "text2":        "#9898b4",
    "text3":        "#5a5a78",
    "border":       "#26264a",
    "input_bg":     "#111126",
}

# ═════════════════════════════════════════════════════════════
# API
# ═════════════════════════════════════════════════════════════
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


# ═════════════════════════════════════════════════════════════
# CANVAS HELPERS
# ═════════════════════════════════════════════════════════════
def draw_rounded_rect(canvas, x1, y1, x2, y2, r=12, **kw):
    pts = [
        x1+r,y1, x2-r,y1, x2,y1, x2,y1+r,
        x2,y2-r, x2,y2, x2-r,y2, x1+r,y2,
        x1,y2, x1,y2-r, x1,y1+r, x1,y1,
    ]
    return canvas.create_polygon(pts, smooth=True, **kw)

def draw_circle(canvas, cx, cy, r, **kw):
    return canvas.create_oval(cx-r, cy-r, cx+r, cy+r, **kw)


class RCard(tk.Canvas):
    """Rounded card with optional top accent bar."""
    def __init__(self, parent, accent_color=None, **kw):
        kw.setdefault('highlightthickness', 0)
        kw.setdefault('bg', C["bg"])
        super().__init__(parent, **kw)
        self._accent = accent_color
        self.bind('<Configure>', self._paint)

    def _paint(self, e=None):
        self.delete('bg')
        w, h = self.winfo_width(), self.winfo_height()
        if w < 2: return
        draw_rounded_rect(self, 1, 1, w-1, h-1, r=14,
                          fill=C["card"], outline=C["card_border"], width=1, tags='bg')
        if self._accent:
            draw_rounded_rect(self, 3, 3, w-3, 7, r=3,
                              fill=self._accent, outline='', tags='bg')
        self.tag_lower('bg')


class GlowButton(tk.Canvas):
    """Modern rounded button with glow effect."""
    def __init__(self, parent, text="", command=None, color=None, width=160, height=38, **kw):
        color = color or C["accent"]
        super().__init__(parent, width=width, height=height,
                         bg=C["bg"], highlightthickness=0, cursor="hand2", **kw)
        self._color = color
        self._text = text
        self._cmd = command
        self._bw = width
        self._bh = height
        self._hover = False
        self._draw()
        self.bind('<Enter>', self._on_enter)
        self.bind('<Leave>', self._on_leave)
        self.bind('<Button-1>', self._on_click)

    def _draw(self):
        self.delete('all')
        w, h = self._bw, self._bh
        c = self._color
        if self._hover:
            # Glow shadow
            draw_rounded_rect(self, 2, 4, w-2, h+2, r=10, fill=c, outline='')
            self.itemconfigure(self.find_all()[-1], stipple='gray50')
        draw_rounded_rect(self, 0, 0, w, h, r=10, fill=c, outline='')
        self.create_text(w//2, h//2, text=self._text, fill='#fff',
                         font=('Segoe UI', 10, 'bold'))

    def _on_enter(self, e):
        self._hover = True
        self._draw()

    def _on_leave(self, e):
        self._hover = False
        self._draw()

    def _on_click(self, e):
        if self._cmd:
            self._cmd()


# ═════════════════════════════════════════════════════════════
# MAIN APP
# ═════════════════════════════════════════════════════════════
class ShadowAdmin(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Shadow Mess — Admin Panel")
        self.geometry("1080x720")
        self.minsize(900, 600)
        self.configure(bg=C["bg"])
        self.option_add('*Font', 'Segoe\\ UI 10')

        try: self.iconbitmap(default='')
        except: pass

        self._setup_styles()
        self._fonts()
        self._build()
        self._nav_click(0)

    def _fonts(self):
        self.f_title  = tkfont.Font(family="Segoe UI", size=22, weight="bold")
        self.f_h2     = tkfont.Font(family="Segoe UI", size=14, weight="bold")
        self.f_body   = tkfont.Font(family="Segoe UI", size=11)
        self.f_small  = tkfont.Font(family="Segoe UI", size=10)
        self.f_tiny   = tkfont.Font(family="Segoe UI", size=9)
        self.f_mono   = tkfont.Font(family="Consolas", size=10)
        self.f_big    = tkfont.Font(family="Segoe UI", size=30, weight="bold")
        self.f_stat   = tkfont.Font(family="Segoe UI", size=12)

    def _setup_styles(self):
        s = ttk.Style(self)
        s.theme_use('clam')
        s.configure('Dark.Treeview',
            background=C["card"], foreground=C["text"],
            fieldbackground=C["card"], borderwidth=0,
            rowheight=42, font=('Segoe UI', 10))
        s.configure('Dark.Treeview.Heading',
            background=C["bg3"], foreground=C["text2"],
            borderwidth=0, font=('Segoe UI', 10, 'bold'),
            relief='flat', padding=(10, 8))
        s.map('Dark.Treeview',
            background=[('selected', C["sidebar_sel"])],
            foreground=[('selected', C["accent2"])])
        s.map('Dark.Treeview.Heading',
            background=[('active', C["card_hover"])])
        s.configure('Dark.Vertical.TScrollbar',
            background=C["card"], troughcolor=C["bg"],
            borderwidth=0, arrowsize=0, width=6)
        s.map('Dark.Vertical.TScrollbar',
            background=[('active', C["text3"]), ('!active', C["border"])])

    # ─────────────────── BUILD UI ───────────────────
    def _build(self):
        # Sidebar
        self.sidebar = tk.Frame(self, bg=C["sidebar"], width=240)
        self.sidebar.pack(side='left', fill='y')
        self.sidebar.pack_propagate(False)

        # Logo
        logo = tk.Frame(self.sidebar, bg=C["sidebar"])
        logo.pack(fill='x', padx=20, pady=(28, 2))
        tk.Label(logo, text="◆", font=('Segoe UI', 24), fg=C["accent"],
                 bg=C["sidebar"]).pack(side='left')
        lbl_f = tk.Frame(logo, bg=C["sidebar"])
        lbl_f.pack(side='left', padx=(8, 0))
        tk.Label(lbl_f, text="Shadow", font=('Segoe UI', 16, 'bold'),
                 fg=C["text"], bg=C["sidebar"]).pack(anchor='w')
        tk.Label(lbl_f, text="Admin Panel", font=('Segoe UI', 9),
                 fg=C["text3"], bg=C["sidebar"]).pack(anchor='w')

        # Separator
        self._sep(self.sidebar, 18)

        # Section: MENU
        tk.Label(self.sidebar, text="   МЕНЮ", font=('Segoe UI', 8, 'bold'),
                 fg=C["text3"], bg=C["sidebar"]).pack(anchor='w', padx=12, pady=(0, 6))

        self._nav_items = [
            ("📊", "Дашборд",       self._page_dashboard),
            ("👥", "Пользователи",  self._page_users),
            ("💬", "Сообщения",     self._page_messages),
            ("💭", "Чаты",          self._page_chats),
            ("🔑", "Сессии",        self._page_sessions),
            ("🔔", "Push",          self._page_push),
        ]
        self._nav_btns = []
        for i, (icon, label, _) in enumerate(self._nav_items):
            btn = self._make_nav(icon, label, i)
            self._nav_btns.append(btn)

        # Spacer
        tk.Frame(self.sidebar, bg=C["sidebar"]).pack(fill='both', expand=True)

        # Danger zone
        self._sep(self.sidebar, 6)
        tk.Label(self.sidebar, text="   ⚠ DANGER ZONE", font=('Segoe UI', 8, 'bold'),
                 fg=C["red"], bg=C["sidebar"]).pack(anchor='w', padx=12, pady=(2, 6))
        self._reset_btn = self._make_nav("🔥", "Полный сброс", len(self._nav_items), danger=True)

        # Server info
        info = tk.Frame(self.sidebar, bg=C["sidebar"])
        info.pack(fill='x', padx=22, pady=(16, 20))
        tk.Label(info, text="Подключено к", font=('Segoe UI', 8),
                 fg=C["text3"], bg=C["sidebar"]).pack(anchor='w')
        sname = SERVER.replace('https://','').replace('http://','')
        self._srv_lbl = tk.Label(info, text=sname, font=('Consolas', 8),
                                 fg=C["accent2"], bg=C["sidebar"])
        self._srv_lbl.pack(anchor='w', pady=(2,0))
        tk.Label(info, text="v2.2", font=('Segoe UI', 8, 'bold'),
                 fg=C["text3"], bg=C["sidebar"]).pack(anchor='w', pady=(6,0))

        # Content
        self.content = tk.Frame(self, bg=C["bg"])
        self.content.pack(side='left', fill='both', expand=True)

    def _sep(self, parent, py=10):
        c = tk.Canvas(parent, bg=C["sidebar"], height=1, highlightthickness=0)
        c.pack(fill='x', padx=18, pady=py)
        c.bind('<Configure>', lambda e, cv=c: (cv.delete('all'),
               cv.create_line(0, 0, e.width, 0, fill=C["border"])))

    def _make_nav(self, icon, label, idx, danger=False):
        fg = C["red"] if danger else C["text2"]
        hov = C["red_dim"] if danger else C["card_hover"]
        sel = C["red_dim"] if danger else C["sidebar_sel"]

        frm = tk.Frame(self.sidebar, bg=C["sidebar"], cursor='hand2')
        frm.pack(fill='x', padx=10, pady=2)

        # Left accent bar (hidden by default)
        bar = tk.Frame(frm, bg=C["accent"], width=3)
        bar.pack(side='left', fill='y')
        bar.pack_forget()  # hidden

        inner = tk.Label(frm, text=f" {icon}   {label}", font=('Segoe UI', 11),
                         fg=fg, bg=C["sidebar"], anchor='w', padx=14, pady=10)
        inner.pack(fill='x')

        frm._bar = bar
        frm._inner = inner
        frm._fg = fg
        frm._hov = hov
        frm._sel = sel
        frm._active = False
        frm._danger = danger
        frm._idx = idx

        def enter(e):
            if not frm._active:
                inner.configure(bg=hov)
                frm.configure(bg=hov)
        def leave(e):
            if not frm._active:
                inner.configure(bg=C["sidebar"])
                frm.configure(bg=C["sidebar"])
        def click(e):
            if danger:
                self._full_reset()
            else:
                self._nav_click(idx)

        for w in (frm, inner):
            w.bind('<Enter>', enter)
            w.bind('<Leave>', leave)
            w.bind('<Button-1>', click)

        return frm

    def _nav_click(self, idx):
        # Deselect all
        for b in self._nav_btns:
            b._active = False
            b._inner.configure(bg=C["sidebar"], fg=b._fg)
            b.configure(bg=C["sidebar"])
            b._bar.pack_forget()
        # Select
        btn = self._nav_btns[idx]
        btn._active = True
        btn._inner.configure(bg=C["sidebar_sel"], fg=C["accent2"])
        btn.configure(bg=C["sidebar_sel"])
        btn._bar.pack(side='left', fill='y', before=btn._inner)
        # Navigate
        self._nav_items[idx][2]()

    def _clear(self):
        for w in self.content.winfo_children():
            w.destroy()

    def _header(self, icon, title, subtitle=""):
        f = tk.Frame(self.content, bg=C["bg"])
        f.pack(fill='x', padx=36, pady=(30, 0))
        tk.Label(f, text=f"{icon}  {title}", font=self.f_title,
                 fg=C["text"], bg=C["bg"]).pack(anchor='w')
        if subtitle:
            tk.Label(f, text=subtitle, font=self.f_small,
                     fg=C["text2"], bg=C["bg"]).pack(anchor='w', pady=(4,0))

    def _divider(self):
        c = tk.Canvas(self.content, bg=C["bg"], height=2, highlightthickness=0)
        c.pack(fill='x', padx=36, pady=(16,18))
        c.bind('<Configure>', lambda e, cv=c: (cv.delete('all'),
               cv.create_line(0,1,e.width,1, fill=C["border"])))

    def _loading(self, text="Загрузка данных..."):
        self._clear()
        f = tk.Frame(self.content, bg=C["bg"])
        f.pack(fill='both', expand=True)
        tk.Label(f, text="⏳", font=('Segoe UI', 32), bg=C["bg"]).pack(expand=True, pady=(0,0))
        tk.Label(f, text=text, font=self.f_body, fg=C["text2"], bg=C["bg"]).pack(pady=(0,60))

    def _threaded(self, func, cb=None):
        def run():
            try:
                r = func()
                if cb: self.after(0, lambda: cb(r))
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Ошибка", str(e)))
        threading.Thread(target=run, daemon=True).start()

    # ─────────────── STAT CARD ──────────────────
    def _stat_card(self, parent, icon, label, value, color=C["accent"]):
        card = RCard(parent, accent_color=color, width=220, height=120)

        # Inner frame placed on canvas
        inner = tk.Frame(card, bg=C["card"])
        inner.place(relx=0.5, rely=0.55, anchor='center')

        row1 = tk.Frame(inner, bg=C["card"])
        row1.pack(anchor='w')
        tk.Label(row1, text=icon, font=('Segoe UI', 20), bg=C["card"]).pack(side='left')
        tk.Label(row1, text=f"  {label}", font=self.f_small, fg=C["text2"],
                 bg=C["card"]).pack(side='left')
        tk.Label(inner, text=str(value), font=self.f_big, fg=color,
                 bg=C["card"]).pack(anchor='w', pady=(4,0))
        return card

    # ═══════════════ DASHBOARD ════════════════════
    def _page_dashboard(self):
        self._loading()
        self._threaded(lambda: api("GET", "/api/admin/stats"), self._render_dash)

    def _render_dash(self, stats):
        self._clear()
        self._header("📊", "Дашборд", "Обзор базы данных Shadow Mess")
        self._divider()

        grid = tk.Frame(self.content, bg=C["bg"])
        grid.pack(fill='x', padx=36)

        items = [
            ("👥", "Пользователей", stats.get("users",0),    C["accent"]),
            ("💭", "Чатов",         stats.get("chats",0),    C["green"]),
            ("💬", "Сообщений",     stats.get("messages",0), C["yellow"]),
            ("🔑", "Сессий",        stats.get("sessions",0), C["blue"]),
            ("🔔", "Push",          stats.get("pushSubs",0), C["text2"]),
        ]
        for i, (icon, label, val, clr) in enumerate(items):
            c = self._stat_card(grid, icon, label, val, clr)
            c.grid(row=i//3, column=i%3, padx=8, pady=8, sticky='nsew')
        for col in range(3):
            grid.columnconfigure(col, weight=1)

        # Actions
        af = tk.Frame(self.content, bg=C["bg"])
        af.pack(fill='x', padx=36, pady=(24,0))
        GlowButton(af, "🔄  Обновить", self._page_dashboard,
                    color=C["bg3"], width=150, height=36).pack(side='left')

        # Tip
        tk.Label(self.content, text="💡 Дважды кликните по пользователю для просмотра деталей",
                 font=self.f_tiny, fg=C["text3"], bg=C["bg"]).pack(padx=36, pady=(20,0), anchor='w')

    # ═══════════════ USERS ════════════════════════
    def _page_users(self):
        self._loading()
        self._threaded(lambda: api("GET", "/api/admin/users"), self._render_users)

    def _render_users(self, users):
        self._clear()
        self._header("👥", "Пользователи", f"Зарегистрировано: {len(users)}")

        # Toolbar
        bar = tk.Frame(self.content, bg=C["bg"])
        bar.pack(fill='x', padx=36, pady=(16,12))
        GlowButton(bar, "🔄 Обновить", self._page_users,
                    color=C["bg3"], width=140, height=34).pack(side='left', padx=(0,10))
        GlowButton(bar, "🗑 Удалить выбранного", self._del_sel_user,
                    color=C["red"], width=190, height=34).pack(side='left', padx=(0,10))
        GlowButton(bar, "⚠ Удалить всех", self._del_all_users,
                    color=C["red_dim"], width=160, height=34).pack(side='right')

        # Table container
        tc = tk.Frame(self.content, bg=C["border"], padx=1, pady=1)
        tc.pack(fill='both', expand=True, padx=36, pady=(0,24))
        ti = tk.Frame(tc, bg=C["card"])
        ti.pack(fill='both', expand=True)

        cols = ("username", "displayName", "createdAt", "lastSeen", "status", "id")
        self.u_tree = ttk.Treeview(ti, columns=cols, show='headings', style='Dark.Treeview')

        heads = [("username","@username",130), ("displayName","Имя",150),
                 ("createdAt","Регистрация",110), ("lastSeen","Последний визит",110),
                 ("status","Статус",80), ("id","ID",200)]
        for col_id, text, w in heads:
            self.u_tree.heading(col_id, text=f"  {text}")
            self.u_tree.column(col_id, width=w, minwidth=60)

        sb = ttk.Scrollbar(ti, orient='vertical', command=self.u_tree.yview,
                           style='Dark.Vertical.TScrollbar')
        self.u_tree.configure(yscrollcommand=sb.set)
        self.u_tree.pack(side='left', fill='both', expand=True)
        sb.pack(side='right', fill='y')

        self._users_data = users
        for u in users:
            uid = u.get('_id') or u.get('id','?')
            online = u.get('online', False)
            status = '🟢 Online' if online else '⚫ Offline'
            self.u_tree.insert('', 'end', values=(
                f"  @{u.get('username','?')}",
                f"  {u.get('displayName','—')}",
                f"  {u.get('createdAt','')[:10]}",
                f"  {(u.get('lastSeen','—') or '—')[:10]}",
                f"  {status}",
                f"  {uid}",
            ))
        self.u_tree.bind('<Double-1>', self._user_detail)

    def _del_sel_user(self):
        sel = self.u_tree.selection()
        if not sel:
            return messagebox.showwarning("Внимание", "Выберите пользователя")
        vals = self.u_tree.item(sel[0])['values']
        uname = str(vals[0]).strip()
        uid = str(vals[5]).strip()
        if not messagebox.askyesno("Подтверждение", f"Удалить {uname}?"):
            return
        self._threaded(
            lambda: api("DELETE", f"/api/admin/users/{uid}"),
            lambda r: (messagebox.showinfo("Готово",
                f"Удалён: {uname}\nСообщений: {r.get('deletedMessages',0)}\n"
                f"Сессий: {r.get('deletedSessions',0)}\nЧатов: {r.get('deletedChats',0)}"),
                       self._page_users()))

    def _del_all_users(self):
        if not messagebox.askyesno("⚠", "Удалить ВСЕХ пользователей?\nНеобратимо!"):
            return
        self._threaded(
            lambda: api("DELETE", "/api/admin/users"),
            lambda r: (messagebox.showinfo("Готово", f"Удалено: {r.get('deleted',0)}"),
                       self._page_users()))

    def _user_detail(self, event):
        sel = self.u_tree.selection()
        if not sel: return
        uid = str(self.u_tree.item(sel[0])['values'][5]).strip()
        user = next((u for u in self._users_data if (u.get('_id') or u.get('id')) == uid), None)
        if not user: return

        win = tk.Toplevel(self)
        win.title(f"Профиль — {user.get('displayName','?')}")
        win.geometry("460x560")
        win.configure(bg=C["bg"])
        win.resizable(False, False)
        win.transient(self)
        win.grab_set()

        # Center
        win.update_idletasks()
        px = self.winfo_x() + (self.winfo_width() - 460) // 2
        py = self.winfo_y() + (self.winfo_height() - 560) // 2
        win.geometry(f"+{px}+{py}")

        # Profile header card
        hc = tk.Frame(win, bg=C["card"])
        hc.pack(fill='x', padx=20, pady=(20,0))

        # Avatar circle (Canvas)
        av_frame = tk.Frame(hc, bg=C["card"])
        av_frame.pack(pady=(20,10))
        av_c = tk.Canvas(av_frame, width=72, height=72, bg=C["card"], highlightthickness=0)
        av_c.pack()
        av_color = user.get('avatarColor', C["accent"])
        draw_circle(av_c, 36, 36, 33, fill=av_color, outline='')
        initials = ''.join(w[0] for w in (user.get('displayName','?') or '?').split()[:2]).upper()
        av_c.create_text(36, 36, text=initials, fill='#fff', font=('Segoe UI', 18, 'bold'))

        # Online indicator
        if user.get('online'):
            draw_circle(av_c, 58, 58, 8, fill=C["bg"], outline='')
            draw_circle(av_c, 58, 58, 6, fill=C["green"], outline='')

        tk.Label(hc, text=user.get('displayName','?'), font=('Segoe UI', 17, 'bold'),
                 fg=C["text"], bg=C["card"]).pack()
        tk.Label(hc, text=f"@{user.get('username','?')}", font=('Segoe UI', 12),
                 fg=C["accent2"], bg=C["card"]).pack(pady=(2,4))

        status = '🟢 В сети' if user.get('online') else '⚫ Не в сети'
        tk.Label(hc, text=status, font=('Segoe UI', 10),
                 fg=C["green"] if user.get('online') else C["text3"], bg=C["card"]).pack(pady=(0,16))

        # Detail fields
        dc = tk.Frame(win, bg=C["card"])
        dc.pack(fill='x', padx=20, pady=(8,0))

        fields = [
            ("ID",          (user.get('_id') or user.get('id','?'))[:30]),
            ("Имя",         user.get('firstName','—')),
            ("Фамилия",     user.get('lastName','—')),
            ("Bio",         (user.get('bio','—') or '—')[:50]),
            ("Аватар",      "✅ Есть" if user.get('avatar') else "❌ Нет"),
            ("Регистрация", user.get('createdAt','?')[:19].replace('T',' ')),
            ("Посл. визит", (user.get('lastSeen','?') or '—')[:19].replace('T',' ')),
        ]
        for lbl, val in fields:
            row = tk.Frame(dc, bg=C["card"])
            row.pack(fill='x', padx=20, pady=3)
            tk.Label(row, text=f"{lbl}:", font=('Segoe UI', 10, 'bold'),
                     fg=C["text2"], bg=C["card"], width=13, anchor='w').pack(side='left')
            tk.Label(row, text=str(val), font=('Segoe UI', 10),
                     fg=C["text"], bg=C["card"], anchor='w').pack(side='left', fill='x', expand=True)

        tk.Frame(dc, bg=C["card"], height=14).pack()

        # Delete button
        bf = tk.Frame(win, bg=C["bg"])
        bf.pack(fill='x', padx=20, pady=(14,20))
        GlowButton(bf, "🗑  Удалить пользователя",
                    lambda: self._confirm_del(win, user),
                    color=C["red"], width=420, height=40).pack()

    def _confirm_del(self, win, user):
        uid = user.get('_id') or user.get('id')
        if messagebox.askyesno("Подтверждение", f"Удалить {user.get('displayName','?')}?", parent=win):
            win.destroy()
            self._threaded(
                lambda: api("DELETE", f"/api/admin/users/{uid}"),
                lambda r: (messagebox.showinfo("Готово", f"Удалён!"), self._page_users()))

    # ─────────── ACTION PAGE TEMPLATE ─────────────
    def _action_page(self, icon, title, desc, btn_text, btn_action, btn_color=C["red"],
                     extra=None):
        self._clear()
        self._header(icon, title)
        self._divider()

        card = RCard(self.content, width=600, height=180)
        card.pack(padx=36, pady=0, fill='x')

        inner = tk.Frame(card, bg=C["card"])
        inner.place(relx=0.5, rely=0.5, anchor='center', relwidth=0.9, relheight=0.75)

        tk.Label(inner, text=desc, font=self.f_body, fg=C["text2"],
                 bg=C["card"], wraplength=500, justify='left').pack(anchor='w', pady=(0,16))
        GlowButton(inner, btn_text, btn_action, color=btn_color,
                    width=260, height=38).pack(anchor='w')
        if extra:
            tk.Label(inner, text=extra, font=self.f_tiny, fg=C["text3"],
                     bg=C["card"]).pack(anchor='w', pady=(10,0))

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
                       lambda r: messagebox.showinfo("Готово", f"Удалено: {r.get('deleted',0)}"))

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
                f"Чатов: {r.get('deletedChats',0)}\nСообщений: {r.get('deletedMessages',0)}"))

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
                       lambda r: messagebox.showinfo("Готово", f"Удалено: {r.get('deleted',0)}"))

    # ═══════════════ PUSH ═════════════════════════
    def _page_push(self):
        self._action_page("🔔", "Push-подписки",
            "Удаляет все push-подписки. Пользователи перестанут получать уведомления.",
            "🧹  Очистить подписки", self._del_push, C["blue"])

    def _del_push(self):
        if not messagebox.askyesno("Подтверждение", "Очистить push-подписки?"):
            return
        self._threaded(lambda: api("DELETE", "/api/admin/pushsubs"),
                       lambda r: messagebox.showinfo("Готово", f"Удалено: {r.get('deleted',0)}"))

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
                f"  Пользователей: {r.get('deletedUsers',0)}\n"
                f"  Чатов: {r.get('deletedChats',0)}\n"
                f"  Сообщений: {r.get('deletedMessages',0)}\n"
                f"  Сессий: {r.get('deletedSessions',0)}"))


# ═════════════════════════════════════════════════════════════
# RUN
# ═════════════════════════════════════════════════════════════
def main():
    global SERVER

    tmp = tk.Tk()
    tmp.withdraw()
    tmp.title("Shadow Mess")
    tmp.attributes('-topmost', True)

    result = sd.askstring(
        "Shadow Mess — Подключение",
        "Введите URL сервера:\n(Enter = по умолчанию)",
        initialvalue=DEFAULT_SERVER,
        parent=tmp
    )
    tmp.destroy()

    SERVER = (result or '').strip().rstrip('/') or DEFAULT_SERVER

    app = ShadowAdmin()
    app.update_idletasks()
    w, h = 1080, 720
    x = (app.winfo_screenwidth() - w) // 2
    y = (app.winfo_screenheight() - h) // 2
    app.geometry(f"{w}x{h}+{x}+{y}")
    app.mainloop()


if __name__ == '__main__':
    main()
