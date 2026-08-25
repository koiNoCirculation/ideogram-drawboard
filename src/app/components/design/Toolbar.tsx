import { Image as ImageIcon, Redo2, Type, Undo2 } from 'lucide-react-native';
import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../../design/designStyles';
import type { ElementTool } from '../../design/useCanvasInteraction';

/** Left sidebar: the two element-creation tools plus undo / redo. */
export const Toolbar = ({
    activeTool,
    onToolToggle,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
}: {
    activeTool: ElementTool | null;
    onToolToggle: (tool: ElementTool) => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
}) => (
    <View style={styles.toolbar}>
        <TouchableOpacity
            style={[styles.toolButton, activeTool === 'text' && styles.toolButtonActive]}
            testID="tool-text"
            onPress={() => onToolToggle('text')}
        >
            <Type color={activeTool === 'text' ? '#FFFFFF' : '#007AFF'} size={28} />
        </TouchableOpacity>
        <TouchableOpacity
            style={[styles.toolButton, activeTool === 'obj' && styles.toolButtonActive]}
            testID="tool-obj"
            onPress={() => onToolToggle('obj')}
        >
            <ImageIcon color={activeTool === 'obj' ? '#FFFFFF' : '#007AFF'} size={28} />
        </TouchableOpacity>

        {/* Undo / redo (greyed out when their stack is empty) */}
        <TouchableOpacity
            style={[styles.toolButton, styles.toolButtonGap]}
            onPress={onUndo}
            disabled={!canUndo}
            testID="undo-button"
        >
            <Undo2 color={canUndo ? '#007AFF' : '#CCCCCC'} size={28} />
        </TouchableOpacity>
        <TouchableOpacity
            style={[styles.toolButton, styles.toolButtonGap]}
            onPress={onRedo}
            disabled={!canRedo}
            testID="redo-button"
        >
            <Redo2 color={canRedo ? '#007AFF' : '#CCCCCC'} size={28} />
        </TouchableOpacity>
    </View>
);
