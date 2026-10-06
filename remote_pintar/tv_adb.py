#!/usr/bin/env python3
"""
TV ADB CONTROL
Kontrol Xiaomi Android TV via ADB.

Bisa dipakai lewat CLI:
    python tv_adb.py home
    python tv_adb.py search_yt lofi hip hop

Atau di-import dari layer suara / LLM:
    from tv_adb import execute
    ok, pesan = execute("volume_up")
    ok, pesan = execute("open_app", "netflix")
"""

import os
import re
import shlex
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

# ============================================
# KONFIGURASI
# ============================================

TV_IP = os.environ.get("TV_IP", "192.168.18.7:5555")
ADB_TIMEOUT = 10

# Nama app -> package (dibuka via monkey, jadi tidak perlu nama activity)
APPS = {
    "netflix": "com.netflix.ninja",
    "youtube": "com.google.android.youtube.tv",
    "spotify": "com.spotify.music",
    "disney": "com.disney.disneyplus",
    "prime": "com.amazon.amazonvideo.livingroom",
    "settings": "com.android.tv.settings",
}

YOUTUBE_PKG = APPS["youtube"]

# Semua fungsi mengembalikan (ok: bool, pesan: str)
Result = tuple


def _ok(msg):
    return True, msg


def _fail(msg):
    return False, msg


# ============================================
# LAYER ADB DASAR
# ============================================

def _run(args, timeout=ADB_TIMEOUT):
    """Jalankan perintah adb mentah. Return (ok, output/error)."""
    try:
        r = subprocess.run(["adb"] + args, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=timeout)
    except FileNotFoundError:
        return _fail("adb tidak ditemukan. Install Android platform-tools dan tambahkan ke PATH.")
    except subprocess.TimeoutExpired:
        return _fail(f"ADB timeout setelah {timeout} detik.")
    except Exception as e:
        return _fail(f"Error: {e}")

    if r.returncode != 0:
        return _fail(r.stderr.strip() or r.stdout.strip() or "Perintah ADB gagal.")
    return _ok(r.stdout.strip())


def is_connected():
    ok, out = _run(["devices"])
    if not ok:
        return False
    for line in out.splitlines()[1:]:
        parts = line.split()
        if len(parts) >= 2 and parts[0] == TV_IP and parts[1] == "device":
            return True
    return False


def ensure_connected():
    """Pastikan TV terhubung; coba `adb connect` bila belum."""
    if is_connected():
        return _ok("Terhubung.")
    ok, out = _run(["connect", TV_IP])
    if ok and is_connected():
        return _ok(f"Terhubung ke {TV_IP}.")
    return _fail(
        f"Tidak bisa terhubung ke {TV_IP}. Pastikan TV menyala, satu jaringan, "
        f"dan USB/Network debugging aktif. Detail: {out}"
    )


def adb(cmd, timeout=ADB_TIMEOUT):
    """Jalankan perintah ADB ke TV (auto-connect)."""
    ok, msg = ensure_connected()
    if not ok:
        return _fail(msg)
    return _run(["-s", TV_IP] + cmd, timeout=timeout)


def keyevent(key):
    """Kirim keyevent. Prefix KEYCODE_ ditambahkan otomatis."""
    key = str(key).upper()
    if not key.isdigit() and not key.startswith("KEYCODE_"):
        key = "KEYCODE_" + key
    ok, out = adb(["shell", "input", "keyevent", key])
    return _ok(f"Keyevent: {key}") if ok else _fail(out)


def type_text(text):
    """Ketik teks di TV (aman untuk spasi & karakter khusus shell)."""
    if not text.strip():
        return _fail("Teks tidak boleh kosong.")
    encoded = shlex.quote(text.replace(" ", "%s"))
    ok, out = adb(["shell", "input", "text", encoded])
    return _ok(f"Ketik: {text}") if ok else _fail(out)


def swipe(x1, y1, x2, y2, duration=300):
    ok, out = adb(["shell", "input", "swipe", str(int(x1)), str(int(y1)),
                   str(int(x2)), str(int(y2)), str(int(duration))])
    return _ok(f"Swipe: ({x1},{y1}) -> ({x2},{y2})") if ok else _fail(out)


# ============================================
# NAVIGASI
# ============================================

def go_home():
    return keyevent("HOME")


def go_back():
    return keyevent("BACK")


def go_up():
    return keyevent("DPAD_UP")


def go_down():
    return keyevent("DPAD_DOWN")


def go_left():
    return keyevent("DPAD_LEFT")


def go_right():
    return keyevent("DPAD_RIGHT")


def press_ok():
    """Tombol OK / select (DPAD_CENTER)."""
    return keyevent("DPAD_CENTER")


def press_menu():
    return keyevent("MENU")


def play_pause():
    return keyevent("MEDIA_PLAY_PAUSE")


def power_toggle():
    return keyevent("POWER")


def wake():
    return keyevent("WAKEUP")


def sleep_tv():
    return keyevent("SLEEP")


# ============================================
# VOLUME
# ============================================

def volume_up():
    return keyevent("VOLUME_UP")


def volume_down():
    return keyevent("VOLUME_DOWN")


def mute():
    """Toggle mute (tekan lagi untuk unmute)."""
    return keyevent("VOLUME_MUTE")


# ============================================
# APP
# ============================================

def open_app(name):
    """
    Buka app. `name` bisa:
      - nama di APPS (netflix, youtube, ...)
      - package saja (com.xxx.yyy)
      - package/activity (com.xxx.yyy/.MainActivity)
    """
    target = APPS.get(name.lower(), name)
    if "/" in target:
        ok, out = adb(["shell", "am", "start", "-n", target])
    else:
        ok, out = adb(["shell", "monkey", "-p", target,
                       "-c", "android.intent.category.LAUNCHER", "1"])
        # monkey mengembalikan exit 0 walau package tidak ada
        if ok and ("No activities found" in out or "monkey aborted" in out.lower()):
            return _fail(f"App '{name}' ({target}) tidak terpasang di TV.")
    return _ok(f"Membuka {name} ({target})") if ok else _fail(out)


def current_package():
    """Package app yang sedang di foreground, atau None."""
    ok, out = adb(["shell", "dumpsys", "window"], timeout=15)
    if not ok:
        return None
    m = re.search(r"mCurrentFocus=.*?\s([\w.]+)/[\w.$]+", out)
    return m.group(1) if m else None


def close_app(name=None):
    """Tutup app tertentu, atau app yang sedang aktif bila name kosong."""
    pkg = APPS.get(name.lower(), name) if name else current_package()
    if not pkg:
        return _fail("Tidak bisa menentukan app yang sedang aktif.")
    ok, out = adb(["shell", "am", "force-stop", pkg])
    return _ok(f"App ditutup: {pkg}") if ok else _fail(out)


# ============================================
# SEARCH & YOUTUBE
# ============================================

def search(query, wait=3):
    """
    Cari di app yang sedang terbuka: tekan SEARCH, tunggu kolom siap,
    ketik per huruf, lalu ENTER. Hasil TIDAK diverifikasi otomatis;
    cek dengan ui_tree / screen.
    """
    ok, msg = keyevent("SEARCH")
    if not ok:
        return _fail(msg)
    time.sleep(wait)
    ok, msg = type_slow(query)
    if not ok:
        return _fail(msg)
    time.sleep(1)
    ok, msg = keyevent("ENTER")
    if not ok:
        return _fail(msg)
    return _ok(f"Perintah cari dikirim: {query}. Verifikasi hasilnya di layar.")


def _youtube_view(url):
    """Buka URL langsung di app YouTube TV lewat intent (tanpa simulasi tombol)."""
    ok, out = adb(["shell", "am", "start", "-a", "android.intent.action.VIEW",
                   "-d", shlex.quote(url), "-p", YOUTUBE_PKG])
    if not ok:
        return _fail(out)
    if "Error" in out:  # am start kadang exit 0 walau intent gagal
        return _fail(out)
    return _ok(f"Intent dikirim: {url}")


def search_youtube(query):
    """Buka halaman hasil pencarian YouTube langsung di app YouTube TV."""
    if not query.strip():
        return _fail("Query tidak boleh kosong.")
    q = urllib.parse.quote_plus(query)
    ok, msg = _youtube_view(f"https://www.youtube.com/results?search_query={q}")
    if not ok:  # fallback ke skema khusus app YouTube
        ok, msg = _youtube_view(f"vnd.youtube://results?search_query={q}")
    return _ok(f"Search YouTube: {query}") if ok else _fail(msg)


def find_youtube_video_id(query):
    """Ambil video ID hasil pertama dari halaman pencarian YouTube (dijalankan di komputer)."""
    url = "https://www.youtube.com/results?search_query=" + urllib.parse.quote_plus(query)
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode("utf-8", errors="ignore")
    except Exception:
        return None
    m = re.search(r'"videoRenderer":\{"videoId":"([\w-]{11})"', html) \
        or re.search(r'"videoId":"([\w-]{11})"', html)
    return m.group(1) if m else None


def _is_youtube_playing():
    ok, out = adb(["shell", "dumpsys", "media_session"], timeout=15)
    if not ok:
        return False
    # cari blok session milik YouTube TV yang state-nya PLAYING (3)
    for block in out.split("\n\n"):
        if YOUTUBE_PKG in block and re.search(r"state=(PlaybackState \{state=)?3\b", block):
            return True
    return "state=3" in out and YOUTUBE_PKG in out


def play_top_result(wait=5, retries=5):
    """Pilih hasil pencarian YouTube teratas & verifikasi video diputar."""
    time.sleep(wait)
    for step in (go_down, press_ok):
        ok, msg = step()
        if not ok:
            return _fail(msg)
        time.sleep(2)

    for _ in range(retries):
        if _is_youtube_playing():
            return _ok("Video YouTube sedang diputar.")
        time.sleep(2)
    return _fail("Video belum terverifikasi sedang diputar.")


def play_youtube(query):
    """Cari di YouTube lalu langsung putar hasil teratas (via video ID)."""
    vid = find_youtube_video_id(query)
    if vid:
        ok, msg = _youtube_view(f"https://www.youtube.com/watch?v={vid}")
        if not ok:
            ok, msg = _youtube_view(f"vnd.youtube://{vid}")
        if not ok:
            return _fail(msg)
        for _ in range(8):
            time.sleep(2)
            if _is_youtube_playing():
                return _ok(f"Memutar: {query} (https://youtu.be/{vid})")
        return _fail(f"Intent terkirim (https://youtu.be/{vid}) tapi playback belum terverifikasi.")

    # Fallback: buka hasil pencarian lalu pilih via navigasi (kurang andal)
    ok, msg = search_youtube(query)
    if not ok:
        return _fail(msg)
    return play_top_result()


# ============================================
# AUTO SKIP IKLAN YOUTUBE
# ============================================

SKIP_WORDS = ("lewati", "skip")


def _foreground_is_youtube():
    """Cek murah: apakah YouTube TV sedang di layar (grep dijalankan di TV)."""
    ok, out = adb(["shell", "dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'"])
    return ok and YOUTUBE_PKG in out


def _dump_ui_nodes():
    """
    Dump UI langsung ke stdout (tanpa tulis file & pull, lebih cepat).
    Return (True, [node dict]) atau (False, pesan_error).
    """
    ok, out = adb(["exec-out", "uiautomator", "dump", "/dev/tty"], timeout=20)
    if not ok:
        return _fail(out)
    start = out.find("<?xml")
    end = out.rfind("</hierarchy>")
    if start < 0 or end < 0:
        return _fail("Dump UI tidak menghasilkan XML (player mungkin sedang sibuk).")
    try:
        root = ET.fromstring(out[start:end + len("</hierarchy>")])
    except ET.ParseError as e:
        return _fail(f"XML error: {e}")

    nodes = []
    for n in root.iter("node"):
        m = re.findall(r"\[(\d+),(\d+)\]", n.get("bounds", ""))
        if len(m) != 2:
            continue
        x1, y1, x2, y2 = (int(v) for pair in m for v in pair)
        nodes.append({
            "label": (n.get("text") or n.get("content-desc") or "").strip(),
            "id": n.get("resource-id", ""),
            "bounds": n.get("bounds", ""),
            "cx": (x1 + x2) // 2,
            "cy": (y1 + y2) // 2,
            "enabled": n.get("enabled") == "true",
            "focused": n.get("focused") == "true",
            "clickable": n.get("clickable") == "true",
        })
    return _ok(nodes)


def _is_skip_label(label):
    """
    True hanya jika tombol sudah AKTIF. Countdown seperti 'Lewati dalam 5'
    atau 'Skip in 5' sengaja ditolak (ada angka / 'dalam' / 'in').
    """
    t = label.strip().lower()
    if not t or not any(w in t for w in SKIP_WORDS):
        return False
    if re.search(r"\d", t) or "dalam" in t or re.search(r"\bin\b", t):
        return False
    return True


def _find_skip_button(nodes):
    cands = [n for n in nodes if n["enabled"] and _is_skip_label(n["label"])]
    # utamakan yang bisa diklik / punya fokus
    cands.sort(key=lambda n: (not (n["clickable"] or n["focused"])))
    return cands[0] if cands else None


def _try_skip():
    """Satu siklus: dump UI -> cari tombol -> tekan. Return (status, pesan)."""
    ok, res = _dump_ui_nodes()
    if not ok:
        return "error", res
    btn = _find_skip_button(res)
    if not btn:
        return "none", "Tidak ada tombol Lewati aktif."
    if btn["focused"]:
        ok, out = keyevent("DPAD_CENTER")
        how = "OK"
    else:
        ok2, out = adb(["shell", "input", "tap", str(btn["cx"]), str(btn["cy"])])
        ok, how = ok2, f"tap {btn['cx']},{btn['cy']}"
    if not ok:
        return "error", out
    return "skipped", f"Iklan dilewati ({how}): '{btn['label']}'"


def skip_ad_once():
    """Cek sekali; tekan Lewati jika tombolnya sedang aktif."""
    if not _foreground_is_youtube():
        return _fail("YouTube tidak sedang di layar.")
    status, msg = _try_skip()
    return (status == "skipped", msg)


def watch_ads(interval=2, duration=0):
    """
    Pantau terus & lewati iklan otomatis. Hentikan dengan Ctrl+C.
    interval : jeda antar pengecekan (detik, minimal 1)
    duration : berhenti otomatis setelah N detik (0 = tanpa batas)
    """
    interval = max(1.0, float(interval))
    duration = float(duration)
    print(f"Memantau iklan YouTube (interval {interval}s). Ctrl+C untuk berhenti.", flush=True)

    start, skipped, errors = time.time(), 0, 0
    try:
        while not duration or time.time() - start < duration:
            if not _foreground_is_youtube():
                time.sleep(3)
                continue
            status, msg = _try_skip()
            if status == "skipped":
                skipped += 1
                errors = 0
                print(msg, flush=True)
                time.sleep(3)  # cooldown: cegah dobel tekan (bisa pause video)
                continue
            if status == "error":
                errors += 1
                if errors % 5 == 1:
                    print(f"(dump UI gagal: {msg})", flush=True)
            time.sleep(interval)
    except KeyboardInterrupt:
        pass
    return _ok(f"Berhenti. Total iklan dilewati: {skipped}")


def ads_debug():
    """Diagnostik: jalankan SAAT iklan tayang untuk melihat apa yang terbaca."""
    lines = [f"YouTube di layar : {_foreground_is_youtube()}", ""]

    ok, out = adb(["shell", "dumpsys media_session | grep -A12 -i youtube"])
    lines.append("--- media_session (YouTube) ---")
    lines.append(out if ok and out else "(kosong)")
    lines.append("")

    ok, res = _dump_ui_nodes()
    lines.append("--- UI: elemen terkait iklan/skip ---")
    if not ok:
        lines.append(f"Dump UI gagal: {res}")
    else:
        keys = SKIP_WORDS + ("iklan", "ad ", "ads", "sponsor")
        hits = [n for n in res if any(k in n["label"].lower() for k in keys)]
        if not hits:
            lines.append("(tidak ada elemen yang cocok; tombol mungkin tidak terbaca UI)")
        for n in hits:
            lines.append(
                f"'{n['label']}' | {n['bounds']} | enabled={n['enabled']} "
                f"focused={n['focused']} clickable={n['clickable']} "
                f"| dianggap siap={_is_skip_label(n['label'])}"
            )
        lines.append(f"\n(total {len(res)} elemen terbaca)")
    return _ok("\n".join(lines))


# ============================================
# INFO
# ============================================

def show_info():
    _, model = adb(["shell", "getprop", "ro.product.model"])
    _, android = adb(["shell", "getprop", "ro.build.version.release"])
    pkg = current_package() or "-"
    return _ok(f"Model: {model}\nAndroid: {android}\nApp aktif: {pkg}")

# ============================================
# TAMBAHAN: OBSERVASI (screen, ui_tree, status)
# Tempel blok ini di tv_adb.py, sebelum bagian "DISPATCHER".
# ============================================

def _run_bytes(args, timeout=ADB_TIMEOUT):
    """Seperti _run, tapi stdout dikembalikan sebagai bytes (untuk PNG)."""
    ok, msg = ensure_connected()
    if not ok:
        return _fail(msg)
    try:
        r = subprocess.run(["adb", "-s", TV_IP] + args,
                           capture_output=True, timeout=timeout)
    except FileNotFoundError:
        return _fail("adb tidak ditemukan. Install Android platform-tools dan tambahkan ke PATH.")
    except subprocess.TimeoutExpired:
        return _fail(f"ADB timeout setelah {timeout} detik.")
    except Exception as e:
        return _fail(f"Error: {e}")
    if r.returncode != 0:
        err = r.stderr.decode("utf-8", errors="replace").strip()
        return _fail(err or "Perintah ADB gagal.")
    return _ok(r.stdout)


def tv_screen(path=None):
    """
    Ambil screenshot TV dan simpan sebagai PNG.
    Return (True, path_file). Layer LLM bisa membaca file ini sebagai gambar.
    """
    ok, data = _run_bytes(["exec-out", "screencap", "-p"])
    if not ok:
        return _fail(data)

    start = data.find(b"\x89PNG\r\n\x1a\n")
    if start < 0:
        _, win = adb(["shell", "dumpsys window | grep -c FLAG_SECURE"], timeout=15)
        if win.strip().isdigit() and int(win.strip()) > 0:
            return _fail("Layar ditandai FLAG_SECURE (umumnya konten DRM); screenshot diblokir sistem. "
                         "Gunakan ui_tree sebagai alternatif.")
        return _fail(f"ADB tidak mengembalikan PNG valid ({len(data)} byte).")

    path = path or f"tv_screen_{int(time.time())}.png"
    try:
        with open(path, "wb") as f:
            f.write(data[start:])
    except OSError as e:
        return _fail(f"Gagal menyimpan screenshot: {e}")
    return _ok(os.path.abspath(path))


def tv_ui_tree(limit=100):
    """Tampilkan elemen UI yang terbaca (teks/deskripsi, fokus, bounds)."""
    ok, res = _dump_ui_nodes()
    if not ok:
        return _fail(res)

    limit = int(limit)
    lines = [
        f"- text={n['label']!r}, focused={n['focused']}, "
        f"clickable={n['clickable']}, bounds={n['bounds']}"
        for n in res if n["label"] or n["focused"]
    ]
    pkg = current_package() or "tidak diketahui"
    if not lines:
        return _ok(f"App: {pkg}\nTidak ada teks/deskripsi yang terbaca "
                   "(app mungkin menggambar UI sendiri atau menyembunyikan konten).")
    extra = f"\n(+{len(lines) - limit} elemen lain disembunyikan)" if len(lines) > limit else ""
    return _ok(f"App: {pkg}\nElemen terbaca ({len(lines)}):\n" + "\n".join(lines[:limit]) + extra)


def tv_status():
    """Laporkan app foreground dan status playback media."""
    pkg = current_package() or "tidak diketahui"
    ok, out = adb(["shell", "dumpsys", "media_session"], timeout=20)
    if ok:
        lines = [l.strip() for l in out.splitlines()
                 if "PlaybackState" in l or "packages=" in l]
        playback = "\n".join(lines[:8]) or "Status playback tidak tersedia."
    else:
        playback = f"(gagal membaca media_session: {out})"
    return _ok(f"App aktif: {pkg}\nStatus media:\n{playback}")

_CHAR_KEYS = {" ": "SPACE", ".": "PERIOD", ",": "COMMA", "-": "MINUS", "'": "APOSTROPHE"}


def type_slow(text, delay=0.2):
    """
    Ketik per karakter lewat keyevent dengan jeda antar huruf.
    Semua keyevent dikirim dalam SATU panggilan adb shell (jeda diatur di TV),
    jadi tidak ada overhead koneksi per huruf.
    Karakter yang tidak didukung (huruf non-ASCII, simbol lain) dilewati.
    """
    if not text.strip():
        return _fail("Teks tidak boleh kosong.")
    delay = max(0.05, float(delay))

    keys, skipped = [], []
    for ch in text:
        if ch.isascii() and ch.isalnum():
            keys.append(ch.upper())
        elif ch in _CHAR_KEYS:
            keys.append(_CHAR_KEYS[ch])
        else:
            skipped.append(ch)
    if not keys:
        return _fail("Tidak ada karakter yang bisa diketik.")

    script = "; ".join(f"input keyevent KEYCODE_{k}; sleep {delay}" for k in keys)
    ok, out = adb(["shell", script], timeout=15 + len(keys) * (delay + 0.5))
    if not ok:
        return _fail(out)
    note = f" (dilewati: {''.join(skipped)})" if skipped else ""
    return _ok(f"Diketik per huruf: {text}{note}")


# ============================================
# DISPATCHER
# ============================================

# nama: (fungsi, usage argumen, deskripsi)
COMMANDS = {
    # Navigasi
    "home": (go_home, "", "Layar utama"),
    "back": (go_back, "", "Kembali"),
    "up": (go_up, "", "Atas"),
    "down": (go_down, "", "Bawah"),
    "left": (go_left, "", "Kiri"),
    "right": (go_right, "", "Kanan"),
    "ok": (press_ok, "", "Tombol OK / select"),
    "menu": (press_menu, "", "Menu"),
    "play_pause": (play_pause, "", "Play / pause"),
    # Power
    "power": (power_toggle, "", "Toggle power"),
    "wake": (wake, "", "Bangunkan TV"),
    "sleep": (sleep_tv, "", "Tidurkan TV"),
    # Volume
    "volume_up": (volume_up, "", "Naikkan volume"),
    "volume_down": (volume_down, "", "Turunkan volume"),
    "mute": (mute, "", "Mute / unmute"),
    # App
    "open_app": (open_app, "<nama|package>", "Buka app"),
    "close_app": (close_app, "[nama]", "Tutup app (default: app aktif)"),
    # Search
    "search": (search, "<query>", "Cari di app yang terbuka"),
    "search_yt": (search_youtube, "<query>", "Cari di YouTube"),
    "play_top_result": (play_top_result, "", "Putar hasil YouTube teratas"),
    "play_yt": (play_youtube, "<query>", "Cari & putar di YouTube"),
    # Iklan YouTube
    "watch_ads": (watch_ads, "[interval] [durasi]", "Pantau & auto-lewati iklan (Ctrl+C stop)"),
    "skip_ad": (skip_ad_once, "", "Lewati iklan sekali jika tombol aktif"),
    "ads_debug": (ads_debug, "", "Diagnostik deteksi iklan (jalankan saat iklan tayang)"),
    # Lanjutan
    "keyevent": (keyevent, "<KEY>", "Kirim keyevent mentah"),
    "type": (type_text, "<teks>", "Ketik teks"),
    "type_slow": (type_slow, "<teks>", "Ketik per huruf dengan jeda (andal untuk Netflix)"),
    "swipe": (swipe, "<x1> <y1> <x2> <y2>", "Swipe"),
    "info": (show_info, "", "Info device"),
    # Observasi
    "screen": (tv_screen, "[path]", "Screenshot TV -> file PNG"),
    "ui_tree": (tv_ui_tree, "[limit]", "Daftar elemen UI yang terbaca"),
    "status": (tv_status, "", "App aktif & status playback"),
}

# perintah yang menerima seluruh argumen sebagai satu teks
_JOIN_ARGS = {"search", "search_yt", "play_yt", "type", "type_slow"}


def execute(command, *args):
    """Titik masuk utama. Return (ok: bool, pesan: str)."""
    entry = COMMANDS.get(command)
    if not entry:
        return _fail(f"Perintah '{command}' tidak dikenal. Tersedia: {', '.join(COMMANDS)}")

    func, usage, _ = entry
    if command in _JOIN_ARGS:
        args = (" ".join(args),) if args else ()
    if command in ("open_app",) and args:
        args = (" ".join(args),)

    try:
        return func(*args)
    except TypeError:
        return _fail(f"Argumen salah. Pakai: {command} {usage}".strip())
    except ValueError:
        return _fail(f"Argumen tidak valid. Pakai: {command} {usage}".strip())


def print_help():
    print("Penggunaan: python tv_adb.py <perintah> [argumen]\n")
    print("Perintah tersedia:")
    for name, (_, usage, desc) in COMMANDS.items():
        print(f"  {(name + ' ' + usage).strip():34} - {desc}")
    print(f"\nTV saat ini: {TV_IP} (ubah dengan env TV_IP)")


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help", "help"):
        print_help()
        return 0
    ok, msg = execute(sys.argv[1], *sys.argv[2:])
    print(msg if ok else f"GAGAL: {msg}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
