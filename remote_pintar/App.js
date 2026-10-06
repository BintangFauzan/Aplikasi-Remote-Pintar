import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Keyboard, Platform, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { GoogleGenAI } from '@google/genai';

const DEFAULT_IP = '192.168.18.8';
const WELCOME_TEXT = 'Halo! Masukkan API Key Google AI Studio dan IP Server komputer Anda.';

const STORAGE_KEYS = {
  API_KEY: '@remote_pintar/api_key',
  SERVER_IP: '@remote_pintar/server_ip',
  CONFIGURED: '@remote_pintar/configured',
};

const loadConfig = async () => {
  try {
    const apiKey = await AsyncStorage.getItem(STORAGE_KEYS.API_KEY);
    const serverIp = await AsyncStorage.getItem(STORAGE_KEYS.SERVER_IP);
    const configured = await AsyncStorage.getItem(STORAGE_KEYS.CONFIGURED);
    return {
      apiKey: apiKey || '',
      serverIp: serverIp || DEFAULT_IP,
      configured: configured === 'true',
    };
  } catch (error) {
    console.error('Gagal memuat konfigurasi:', error);
    return { apiKey: '', serverIp: DEFAULT_IP, configured: false };
  }
};

const saveConfig = async (apiKey, serverIp, configured) => {
  try {
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.API_KEY, apiKey),
      AsyncStorage.setItem(STORAGE_KEYS.SERVER_IP, serverIp),
      AsyncStorage.setItem(STORAGE_KEYS.CONFIGURED, String(configured)),
    ]);
  } catch (error) {
    console.error('Gagal menyimpan konfigurasi:', error);
  }
};

const clearConfig = async () => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.API_KEY),
      AsyncStorage.removeItem(STORAGE_KEYS.SERVER_IP),
      AsyncStorage.removeItem(STORAGE_KEYS.CONFIGURED),
    ]);
  } catch (error) {
    console.error('Gagal membersihkan konfigurasi:', error);
  }
};

const tvTools = [{
  functionDeclarations: [
    {
      name: 'execute_tv_command',
      description: 'Menjalankan perintah kontrol Android TV via ADB.',
      parameters: {
        type: 'OBJECT',
        properties: {
          command: {
            type: 'STRING',
            description: 'Pilih nama perintah yang TEPAT dari daftar ini: home, back, up, down, left, right, ok, menu, play_pause, power, wake, sleep, volume_up, volume_down, mute, open_app, close_app, current_package, search, search_yt, play_top_result, play_yt, watch_ads, skip_ad, ads_debug, keyevent, type, type_slow, swipe, info, screen, ui_tree, status.',
          },
          args: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: "Daftar argumen parameter perintah. Aturan: 1) open_app butuh args nama aplikasi (contoh: ['netflix'], ['youtube'], ['spotify']). 2) search_yt atau play_yt butuh args query pencarian (contoh: ['bing bunny']). 3) volume_up, home, back, ok, dll tidak butuh args (isi [] kosong).",
          },
        },
        required: ['command'],
      },
    },
  ],
}];

const SYSTEM_INSTRUCTION = `Anda adalah asisten cerdas pengendali Android TV (Xiaomi Android TV) berbasis ADB. Anda memiliki akses ke fungsi execute_tv_command untuk menjalankan perintah kontrol TV. Gunakan DAFTAR PERINTAH BERSERTIFIKASI di bawah ini saja. Jangan pernah menggunakan atau mengarang nama command di luar daftar ini.

=== DAFTAR PERINTAH TV_ADB LENGKAP ===

1. NAVIGASI & KONTROL:
   - home : tombol HOME ke layar utama
   - back : tombol kembali (BACK)
   - up : arah atas (DPAD_UP)
   - down : arah bawah (DPAD_DOWN)
   - left : arah kiri (DPAD_LEFT)
   - right : arah kanan (DPAD_RIGHT)
   - ok : tombol pilih/enter (DPAD_CENTER)
   - menu : tombol MENU
   - play_pause : play/pause media

2. POWER:
   - power : toggle daya TV
   - wake : bangunkan TV (WAKEUP)
   - sleep : tidurkan TV (SLEEP)

3. VOLUME:
   - volume_up : naikkan volume
   - volume_down : turunkan volume
   - mute : mute/unmute suara

4. APLIKASI:
   - open_app <nama|package> : buka aplikasi (args: ['netflix'], ['youtube'], ['spotify'], ['disney'], ['prime'], ['settings'])
   - close_app [nama] : tutup app aktif, atau spesifik args=['netflix']
   - current_package : ambil package app yang sedang di-foreground

5. PENCARIAN & YOUTUBE:
   - search <query> : cari di app yang sedang terbuka, ketik query
   - search_yt <query> : cari langsung di app YouTube TV
   - play_yt <query> : cari & putar video YouTube teratas via video ID
   - play_top_result : pilih hasil teratas YouTube (setelah search_yt)

6. IKLAN YOUTUBE (AUTO SKIP):
   - skip_ad : lewati iklan sekali jika tombol Lewati aktif
   - watch_ads [interval] [durasi] : pantau & auto-lewati iklan terus menerus (Ctrl+C stop)
   - ads_debug : diagnostik deteksi iklan (jalankan saat iklan tayang)

7. OBSERVASI & STATUS:
   - info : info device (model, Android version, app aktif)
   - status : app foreground & status playback media_session
   - screen [path] : screenshot TV ke file PNG
   - ui_tree [limit] : dump UI XML, list elemen interaktif di layar

8. LANJUTAN (KEYEVENT / TEXT INPUT):
   - keyevent <KEY> : kirim keyevent mentah (misal KEYCODE_VOLUME_UP, KEYCODE_ENTER, KEYCODE_HOME)
   - type <teks> : ketik teks
   - type_slow <teks> : ketik per karakter dengan jeda (andal untuk aplikasi seperti Netflix)
   - swipe <x1> <y1> <x2> <y2> : swipe layar

=== CARA MEMAKAI ===
- Isi field command dengan nama PERINTAH persis seperti daftar di atas (misalnya: 'volume_up', 'open_app', 'search_yt').
- Isi field args sebagai ARRAY string sesuai kebutuhan:
  * command butuh argumen (open_app, search_yt, play_yt, search, type, type_slow, swipe, close_app) -> isi args, contoh ['netflix'], ['bing bunny'], ['10 100 10 200']
  * command tanpa argumen (volume_up, home, back, ok, play_pause, skip_ad, info, status, dsb) -> isi args: [] (kosong)

=== CONTOH ===
- Pengguna: 'besarkan volume' -> {command: 'volume_up', args: []}
- Pengguna: 'putar volume lebih kecil' -> {command: 'volume_down', args: []}
- Pengguna: 'mute suara TV' -> {command: 'mute', args: []}
- Pengguna: 'buka netflix' -> {command: 'open_app', args: ['netflix']}
- Pengguna: 'buka youtube' -> {command: 'open_app', args: ['youtube']}
- Pengguna: 'tutup aplikasi sekarang' -> {command: 'close_app', args: []}
- Pengguna: 'kembali' -> {command: 'back', args: []}
- Pengguna: 'pindah ke layar utama' -> {command: 'home', args: []}
- Pengguna: 'cari lofi di youtube' -> {command: 'search_yt', args: ['lofi']}
- Pengguna: 'putar video bing bunny di youtube' -> {command: 'play_yt', args: ['bing bunny']}
- Pengguna: 'lewatkan iklan' -> {command: 'skip_ad', args: []}
- Pengguna: 'apa app yang sedang jalan' -> {command: 'current_package', args: []}
- Pengguna: 'bagaimana kondisi playback TV' -> {command: 'status', args: []}
- Pengguna: 'cek apakah tv menyala' -> {command: 'status', args: []}
- Pengguna: 'foto layar tv' -> {command: 'screen', args: []}
- Pengguna: 'tampilkan menu di layar tv' -> {command: 'ui_tree', args: []}
- Pengguna: 'info tv' -> {command: 'info', args: []}
- Pengguna: 'naikkan volume 3x' -> {command: 'volume_up', args: []} (ulang 3 kali)
- Pengguna: 'tekan tombol kanan 2 kali' -> {command: 'right', args: []} (ulang 2 kali)

=== ATURAN PENTING ===
- Selalu gunakan command yang TEPAT sesuai daftar. Jika ragu, jangan menebak.
- Untuk mengulang perintah (misal naikkan volume), panggil fungsi beberapa kali secara berurutan.
- Setelah menerima hasil fungsi, jangan memanggil perintah yang sama lagi kecuali memang diminta. Jawab pengguna dengan konfirmasi singkat berdasarkan hasilnya.
- Jika hasil fungsi berisi ok: false, JANGAN mencoba ulang. Laporkan kegagalannya ke pengguna dengan singkat.`;

// Riwayat chat biasa (tanpa pesan system/tool), harus diawali giliran user
const buildBaseContents = (msgs) => {
  const contents = msgs
    .slice(1) // lewati pesan sambutan
    .filter(m => m.sender === 'user' || m.sender === 'gemini')
    .map(m => ({
      role: m.sender === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    }));
  while (contents.length && contents[0].role === 'model') contents.shift();
  return contents;
};

let idCounter = 0;
const newId = (prefix = 'msg') => `${prefix}-${Date.now()}-${idCounter++}`;

function MainApp() {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [serverIp, setServerIp] = useState(DEFAULT_IP);
  const [isConfigured, setIsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([
    { id: '1', text: WELCOME_TEXT, sender: 'gemini' },
  ]);
  const [inputText, setInputText] = useState('');
  const messagesRef = useRef([]);
  const listRef = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Pantau keyboard: saat keyboard terbuka, jarak bar navigasi tidak perlu ditambahkan
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    loadConfig().then(config => {
      setApiKey(config.apiKey);
      setServerIp(config.serverIp);
      setIsConfigured(config.configured);
      setLoading(false);
    });
  }, []);

  const scrollToBottom = (animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  };

  // Scroll ke bawah saat keyboard muncul agar pesan terakhir tetap terlihat
  useEffect(() => {
    if (keyboardVisible) scrollToBottom();
  }, [keyboardVisible]);

  const handleSaveConfig = async () => {
    if (!apiKey.trim()) {
      Alert.alert('Error', 'API Key wajib diisi.');
      return;
    }
    await saveConfig(apiKey, serverIp, true);
    setIsConfigured(true);
    setMessages(prev => [...prev, {
      id: newId('cfg'),
      text: 'Konfigurasi tersimpan. Silakan beri perintah seperti "besarkan volume" atau "buka netflix".',
      sender: 'gemini',
    }]);
  };

  const handleLogout = () => {
    Alert.alert('Konfirmasi', 'Hapus API key dan IP server yang tersimpan?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        onPress: async () => {
          await clearConfig();
          setApiKey('');
          setServerIp(DEFAULT_IP);
          setIsConfigured(false);
        },
      },
    ]);
  };

  const handleClearChat = () => {
    Alert.alert('Konfirmasi', 'Hapus seluruh riwayat percakapan dan mulai dari awal?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        onPress: () => {
          setMessages([{ id: newId('welcome'), text: WELCOME_TEXT, sender: 'gemini' }]);
        },
      },
    ]);
  };

  const callTvServer = async (command, args = []) => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60000);
    try {
      const res = await fetch(`http://${serverIp}:5000/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, args }),
        signal: controller.signal,
      });

      let data = null;
      try {
        data = await res.json();
      } catch (_) {
        // body bukan JSON, abaikan
      }

      if (!res.ok) {
        return { ok: false, message: data?.message || `Server error (${res.status})` };
      }
      return data ?? { ok: false, message: 'Respons server kosong.' };
    } catch (error) {
      const reason = timedOut
        ? 'timeout (60 detik)'
        : error.message || 'koneksi gagal';
      return {
        ok: false,
        message: `Gagal menerima respons dari backend Termux: ${reason}. Periksa server dan koneksi jaringan.`,
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const executeWithHistory = async (contents) => {
    const ai = new GoogleGenAI({ apiKey });
    return ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents,
      config: {
        tools: tvTools,
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });
  };

  const executeMultiStepCommand = async (userMessage, previousMessages) => {
    const MAX_LOOPS = 8;

    // Riwayat lokal untuk seluruh loop ini (tidak bergantung pada state/ref yang basi)
    const contents = [
      ...buildBaseContents(previousMessages),
      { role: 'user', parts: [{ text: userMessage.text }] },
    ];

    for (let i = 0; i < MAX_LOOPS; i++) {
      const response = await executeWithHistory(contents);
      const calls = response.functionCalls;

      // Tidak ada function call -> jawaban final
      if (!calls || calls.length === 0) {
        setMessages(prev => [...prev, {
          id: newId('final'),
          text: response.text || 'Tidak ada respon.',
          sender: 'gemini',
        }]);
        return;
      }

      // 1) Masukkan giliran model (berisi functionCall) apa adanya
      contents.push(response.candidates[0].content);

      // 2) Jalankan semua call, kumpulkan functionResponse
      const responseParts = [];
      for (const call of calls) {
        const command = call.args?.command;
        const args = call.args?.args || [];

        setMessages(prev => [...prev, {
          id: newId('run'),
          text: `🔧 Menjalankan: ${command}${args.length ? ' ' + args.join(' ') : ''}...`,
          sender: 'system',
        }]);

        const result = call.name === 'execute_tv_command'
          ? await callTvServer(command, args)
          : { ok: false, message: `Fungsi tidak dikenal: ${call.name}` };

        setMessages(prev => [...prev, {
          id: newId('res'),
          text: `${result.ok ? '✅' : '❌'} ${command}${args.length ? ' ' + args.join(' ') : ''}: ${result.message}`,
          sender: 'tool', // bukan 'gemini', supaya tidak masuk riwayat teks
        }]);

        responseParts.push({
          functionResponse: { name: call.name, response: result },
        });
      }

      // 3) Kirim hasil sebagai giliran user -> riwayat berakhir di giliran user
      contents.push({ role: 'user', parts: responseParts });
    }

    setMessages(prev => [...prev, {
      id: newId('max'),
      text: 'Batas langkah tercapai, proses dihentikan.',
      sender: 'gemini',
    }]);
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !isConfigured || loading) return;

    const userMessage = { id: newId('user'), text: inputText.trim(), sender: 'user' };
    const previousMessages = messagesRef.current; // belum termasuk userMessage
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      await executeMultiStepCommand(userMessage, previousMessages);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: newId('err'),
        text: `❌ Gagal memproses permintaan: ${error.message || 'Terjadi kesalahan tak dikenal.'}`,
        sender: 'gemini',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }) => {
    if (item.sender === 'system') {
      return (
        <View style={styles.systemRow}>
          <View style={styles.systemLine} />
          <Text style={styles.systemText}>{item.text}</Text>
          <View style={styles.systemLine} />
        </View>
      );
    }

    const isUser = item.sender === 'user';
    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.geminiBubble]}>
        <Text style={[styles.messageText, isUser ? styles.userText : styles.geminiText]}>
          {item.text}
        </Text>
      </View>
    );
  };

  const sendDisabled = loading || !inputText.trim();

  return (
    // Sisi bawah ditangani manual lewat inputContainer, jadi dikecualikan di sini
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Gemini TV Remote</Text>
        <Text style={styles.headerSubtitle}>gemini-3.5-flash-lite + ADB Bridge</Text>
      </View>

      {!isConfigured ? (
        <View style={[styles.keyContainer, { paddingBottom: 24 + insets.bottom }]}>
          <Text style={styles.keyLabel}>Google AI Studio API Key:</Text>
          <TextInput
            style={styles.keyInput}
            placeholder="AIzaSy..."
            placeholderTextColor="#888"
            secureTextEntry
            value={apiKey}
            onChangeText={setApiKey}
          />
          <Text style={styles.keyLabel}>IP Server Termux (Flask):</Text>
          <TextInput
            style={styles.keyInput}
            placeholder="192.168.18.X"
            placeholderTextColor="#888"
            value={serverIp}
            onChangeText={setServerIp}
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveConfig}>
            <Text style={styles.saveButtonText}>Simpan & Hubungkan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
        >
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleLogout}>
              <Text style={styles.logoutText}>Ubah</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClearChat}>
              <Text style={styles.clearChatText}>Hapus Percakapan</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.chatList}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollToBottom()}
            onLayout={() => scrollToBottom(false)}
          />

          {loading && (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Gemini memproses perintah TV...</Text>
            </View>
          )}

          <View
            style={[
              styles.inputContainer,
              { paddingBottom: 12 + (keyboardVisible ? 0 : insets.bottom) },
            ]}
          >
            <TextInput
              style={styles.textInput}
              placeholder="Contoh: Besarkan volume / Buka Netflix"
              placeholderTextColor="#888"
              value={inputText}
              onChangeText={setInputText}
              multiline={true}
            />
            <TouchableOpacity
              style={[styles.sendButton, sendDisabled && styles.sendButtonDisabled]}
              onPress={sendMessage}
              disabled={sendDisabled}
            >
              <Text style={styles.sendButtonText}>Kirim</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FB',
  },
  header: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333333',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  logoutText: {
    fontSize: 12,
    color: '#666666',
    textDecorationLine: 'underline',
  },
  clearChatText: {
    fontSize: 12,
    color: '#D32F2F',
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
  keyContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  keyLabel: {
    fontSize: 14,
    marginBottom: 6,
    color: '#333333',
    fontWeight: '600',
  },
  keyInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E8ED',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 15,
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  content: {
    flex: 1,
  },
  chatList: {
    padding: 16,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 12,
    marginVertical: 6,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  geminiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E8ED',
  },
  messageText: {
    fontSize: 15,
  },
  userText: {
    color: '#FFFFFF',
  },
  geminiText: {
    color: '#333333',
  },
  loadingContainer: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  loadingText: {
    fontSize: 12,
    color: '#888888',
    fontStyle: 'italic',
  },
  systemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 16,
  },
  systemLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#D0D7DF',
  },
  systemText: {
    fontSize: 11,
    color: '#007AFF',
    paddingHorizontal: 8,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E1E8ED',
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    fontSize: 15,
    color: '#333333',
    maxHeight: 120,
    minHeight: 40,
    textAlignVertical: 'center',
  },
  sendButton: {
    marginLeft: 10,
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
