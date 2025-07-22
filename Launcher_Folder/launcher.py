import subprocess
import tkinter as tk
from tkinter import messagebox
import os
import sys

def start_backend():
    try:
        subprocess.Popen([
            'cmd.exe', '/k',
            'cd /d C:\\Users\\Istvan\\Bachelors_bot\\backend && python app.py'
        ])
    except Exception as e:
        messagebox.showerror("Error", f"Failed to start backend: {e}")

def start_frontend():
    try:
        subprocess.Popen([
            'cmd.exe', '/k',
            'cd /d C:\\Users\\Istvan\\Bachelors_bot\\my-app && npm start'
        ])
    except Exception as e:
        messagebox.showerror("Error", f"Failed to start frontend: {e}")

def start_both():
    # 1) Start backend now
    start_backend()
    # 2) Schedule frontend after 5 seconds (5000 ms)
    root.after(5000, start_frontend)

# === Resolve bundled icon path (works for .py and .exe) ===
if getattr(sys, 'frozen', False):
    base_path = sys._MEIPASS
else:
    base_path = os.path.abspath(".")

icon_path = os.path.join(base_path, "icon.png")

# === GUI Styling ===
root = tk.Tk()
root.title("📊 Bachelors Bot Launcher")
root.geometry("400x250")
root.configure(bg="#0f172a")  # Deep dark background

try:
    root.iconphoto(False, tk.PhotoImage(file=icon_path))
except Exception as e:
    print(f"Could not load icon: {e}")

style = {
    "bg": "#1e293b", "fg": "white",
    "activebackground": "#334155", "activeforeground": "white",
    "font": ("Segoe UI", 10, "bold")
}

tk.Label(root, text="Configure Launch", bg="#0f172a", fg="white", font=("Segoe UI", 14)).pack(pady=15)

tk.Button(root, text="▶ Start Backend", command=start_backend, width=30, height=2, **style).pack(pady=5)
tk.Button(root, text="▶ Start Frontend", command=start_frontend, width=30, height=2, **style).pack(pady=5)
tk.Button(root, text="🚀 Start Both",   command=start_both,   width=30, height=2, **style).pack(pady=10)

root.mainloop()
