import { Image as ImageIcon, Type } from 'lucide-react-native';
import { useState } from 'react';
import {
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export default function DesignScreen() {
  const [title, setTitle] = useState('Untitled Design');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainContent}>
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.toolButton} onPress={() => {}}>
            <Type color="#007AFF" size={28} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolButton} onPress={() => {}}>
            <ImageIcon color="#007AFF" size={28} />
          </TouchableOpacity>
        </View>

        <View style={styles.canvasArea}>
          <View style={styles.topBar}>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Untitled Design"
            />
            <View style={styles.spacer} />
          </View>

          <View style={styles.canvasContainer}>
            <View style={styles.canvas}>
              <Text style={styles.canvasPlaceholderText}>Canvas Area</Text>
            </View>
          </View>
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
  toolbar: {
    width: 70,
    backgroundColor: '#F8F9FA',
    borderRightWidth: 1,
    borderRightColor: '#EEEEEE',
    alignItems: 'center',
    paddingTop: 20,
  },
  toolButton: {
    marginBottom: 30,
    padding: 10,
  },
  canvasArea: {
    flex: 1,
    flexDirection: 'column',
  },
  topBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  backButton: {
    marginRight: 16,
  },
  titleInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  spacer: {
    width: 40,
  },
  canvasContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasPlaceholderText: {
    color: '#CCC',
    fontSize: 20,
  },
});
