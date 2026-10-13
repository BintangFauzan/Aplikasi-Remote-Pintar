import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function MessageItem({ item }) {
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
}

const styles = StyleSheet.create({
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
});
