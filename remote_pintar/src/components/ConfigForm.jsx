import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function ConfigForm({ apiKey, setApiKey, serverIp, setServerIp, onSave, paddingBottom }) {
  return (
    <View style={[styles.keyContainer, { paddingBottom }]}>
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
      <TouchableOpacity style={styles.saveButton} onPress={onSave}>
        <Text style={styles.saveButtonText}>Simpan & Hubungkan</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
