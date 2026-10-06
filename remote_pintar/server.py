from flask import Flask, request, jsonify
from flask_cors import CORS
import tv_adb

app = Flask(__name__)
CORS(app)

@app.route("/execute", methods=["POST"])
def execute_command():
    data = request.json or {}
    cmd = data.get("command")
    args = data.get("args", [])

    if not cmd:
        return jsonify({"ok": False, "message": "Parameter 'command' wajib diisi."}), 400

    ok, msg = tv_adb.execute(cmd, *args)
    return jsonify({"ok": ok, "message": msg})

@app.route("/commands", methods=["GET"])
def list_commands():
    cmds = {name: desc for name, (_, _, desc) in tv_adb.COMMANDS.items()}
    return jsonify({"ok": True, "commands": cmds})

if __name__ == "__main__":
    print("Menjalankan TV ADB Bridge Server di http://0.0.0.0:5000")
    app.run(host="0.0.0.0", port=5000, debug=True)
