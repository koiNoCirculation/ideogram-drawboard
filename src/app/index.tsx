import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';

const RECENT_DESIGNS = [
  "A lone sailboat on calm water at sunset.",
  "A medium-shot photograph of a barista pouring latte art in a cozy cafe",
  "an isometric illustration of a tiny city floating in the clouds",
];

export default function IndexScreen() {
  const router = useRouter();
  const [description, setDescription] = useState('');

  const handleStartDesigning = () => {
    // In a real app, we might pass the description to the next screen
    router.push('/design');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainContent}>
        {/* Left Sidebar: Recent Designs */}
        <View style={styles.leftSidebar}>
          <Text style={styles.sidebarTitle}>最近的设计</Text>
          <ScrollView style={styles.recentList}>
            {RECENT_DESIGNS.map((item, index) => (
              <TouchableOpacity key={index} style={styles.card}>
                <Text style={styles.cardText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Right Section: Input Area */}
        <View style={styles.rightSection}>
          <Text style={styles.sectionTitle}>Enter the description of your dreamed image</Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textArea}
              placeholder="a golden retriever on a skateboard"
              placeholderTextColor="#999"
              multiline
              value={description}
              onChangeText={setDescription}
            />
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={handleStartDesigning}
          >
            <Text style={styles.buttonText}>开始设计</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },
  leftSidebar: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#EEEEEE',
    padding: 16,
  },
  sidebarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  recentList: {
    flex: 1,
  },
  card: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  cardText: {
    fontSize: 14,
    color: '#666',
  },
  rightSection: {
    flex: 2,
    padding: 24,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#000',
  },
  inputContainer: {
    flex: 1,
    marginBottom: 20,
  },
  textArea: {
    flex: 1,
    borderColor: '#DDD',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    fontSize: 18,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
