import { Text, View } from 'react-native';
import { styles } from '../../design/designStyles';
import { ColorPalette } from '../ColorPalette';

/** A small component to display a keyword as a stylized tag. */
const Tag = ({ text }: { text: string }) => {
    if (!text || text.trim() === '') return null;
    return (
        <View style={styles.tag}>
            <Text style={styles.tagText}>{text.trim()}</Text>
        </View>
    );
};

/**
 * Metadata bar: six sections in one row, each capped at 20% of the row width;
 * tags/swatches wrap inside a section instead of scrolling it off-screen.
 * Aesthetics/Lighting/Photo/Art Style/Medium are read-only (from the LLM);
 * the palette is editable.
 */
export const MetadataBar = ({
    aesthetics,
    lighting,
    medium,
    photo,
    artStyle,
    palette,
    onPaletteChange,
}: {
    aesthetics: string;
    lighting: string;
    medium: string;
    photo: string;
    artStyle: string;
    palette: string[];
    onPaletteChange: (colors: string[]) => void;
}) => (
    <View style={styles.metadataContainer}>
        <View style={styles.metadataGroup}>
            <Text style={styles.groupLabel}>Aesthetics</Text>
            <View style={styles.tagRow}>
                {aesthetics.split(',').map((val, i) => <Tag key={`aes-${i}`} text={val} />)}
            </View>
        </View>
        <View style={styles.metadataGroup}>
            <Text style={styles.groupLabel}>Lighting</Text>
            <View style={styles.tagRow}>
                {lighting.split(',').map((val, i) => <Tag key={`light-${i}`} text={val} />)}
            </View>
        </View>
        {artStyle !== '' && (
            <View style={styles.metadataGroup}>
                <Text style={styles.groupLabel}>Art Style</Text>
                <View style={styles.tagRow}>
                    {artStyle.split(' ').map((val, i) => <Tag key={`style-${i}`} text={val} />)}
                </View>
            </View>
        )}
        {photo !== '' && (
            <View style={styles.metadataGroup}>
                <Text style={styles.groupLabel}>Photo</Text>
                <View style={styles.tagRow}>
                    {photo.split(',').map((val, i) => <Tag key={`photo-${i}`} text={val} />)}
                </View>
            </View>
        )}
        <View style={styles.metadataGroup}>
            <Text style={styles.groupLabel}>Medium</Text>
            <View style={styles.tagRow}>
                <Tag text={medium} />
            </View>
        </View>
        <View style={styles.metadataGroup}>
            <Text style={styles.groupLabel}>Palette</Text>
            <ColorPalette palette={palette} onPaletteChange={onPaletteChange} />
        </View>
    </View>
);
