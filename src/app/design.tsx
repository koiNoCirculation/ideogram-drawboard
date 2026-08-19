import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Type, Image as ImageIcon, ArrowLeft } from 'lucide-react-native';

interface RefinedPrompt {
  aspect_ratio: string;
  high_level_description: string;
  compositional_deconstruction: {
    background: string;
    elements: Array<{
      type: 'obj' | 'text';
      bbox?: [number, number, number, number];
      desc?: string;
      text?: string;
    }>;
  };
}

export default function DesignScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [title, setTitle] = useState('Untitled Design');
  const [refinedData, setRefinedData] = useState<RefinedPrompt | null>(null);

  useEffect(() => {
    if (params.promptData) {
      try {
        const parsed = JSON.parse(params.promptData as string);
        setRefinedData(parsed);
        // Use the high level description as the initial title
        if (parsed.high_level_description) {
          setTitle(parsed.high_level_description.slice(0, 30) + (parsed.high_level_description.length > 30 ? '...' : ''));
        }
      } catch (e) {
        console.error('Failed to parse promptData', e);
      }
    }
  }, [params.promptData]);

  const handleBack = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainContent}>
        {/* Left Sidebar: Toolbar */}
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.toolButton} onPress={() => console.log('Add Text')}>
            <Type color="#007AFF" size={28} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolButton} onPress={() => console.log('Add Object')}>
            <ImageIcon color="#007AFF" size={28} />
          </TouchableOpacity>
        </View>

        {/* Right Content: Title & Canvas */}
        <View style={styles.canvasArea}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <ArrowLeft color="#333" size={24} />
            </TouchableOpacity>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Untitled Design"
            />
            <View style={styles.spacer} />
          </View>

          {/* Canvas Placeholder */}
          <View style={styles.canvasContainer}>
            <View style={styles.canvas}>
              {refinedData ? (
                <View style={styles.infoOverlay}>
                  <Text style={styles.infoText}>Parsed Concept:</Text>
                  <Text style={styles.descText}>{refinedData.high_level_description}</Text>
                  <Text style={styles.countText}>Elements detected: {refinedData.compositional_deconstruction.elements.length}</Text>
                </View>
              ) : (
                <Text style={styles.canvasPlaceholderText}>Canvas Area</Text>
              )}
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
    padding: 20,
  },
  canvasPlaceholderText: {
    color: '#CCC',
    fontSize: 20,
  },
  infoOverlay: {
    width: '100%',
    alignItems: 'center',
  },
  infoText: {
    fontSize: 12,
    color: '#AAA',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  descText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    lineHeight: 24,
    fontStyle: 'italic',
  },
  countText: {
    marginTop: 16,
    fontSize: 14,
    color: '#007AFF',
    fontWeight: 'bold',
  },
});
