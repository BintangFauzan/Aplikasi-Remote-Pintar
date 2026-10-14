import React, { useState, useEffect, useRef, useContext } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, KeyboardAvoidingView, Keyboard, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import Header from './src/components/Header';
import ConfigForm from './src/components/ConfigForm';
import MessageItem from './src/components/MessageItem';
import ChatInput from './src/components/ChatInput';
import { TvContext } from './src/store/TvContext';
import TvContextStore from './src/store/TvContext';

function MainApp() {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const listRef = useRef(null);

  const {
    apiKey,
    setApiKey,
    serverIp,
    setServerIp,
    isConfigured,
    loading,
    messages,
    inputText,
    setInputText,
    handleSaveConfig,
    handleLogout,
    handleClearChat,
    sendMessage,
  } = useContext(TvContext);

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

  const scrollToBottom = (animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  };

  useEffect(() => {
    if (keyboardVisible) scrollToBottom();
  }, [keyboardVisible]);

  const sendDisabled = loading || !inputText.trim();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <Header />

      {!isConfigured ? (
        <ConfigForm
          apiKey={apiKey}
          setApiKey={setApiKey}
          serverIp={serverIp}
          setServerIp={setServerIp}
          onSave={handleSaveConfig}
          paddingBottom={24 + insets.bottom}
        />
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
            renderItem={({ item }) => <MessageItem item={item} />}
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

          <ChatInput
            inputText={inputText}
            setInputText={setInputText}
            onSend={sendMessage}
            disabled={sendDisabled}
            paddingBottom={12 + (keyboardVisible ? 0 : insets.bottom)}
          />
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <TvContextStore>
        <MainApp />
      </TvContextStore>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FB',
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
  content: {
    flex: 1,
  },
  chatList: {
    padding: 16,
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
});
