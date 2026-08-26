import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';
import { cameFromHome } from '../../services/designStore';

// Back button for the design screen's Stack header (left of the "design"
// title), passed as the screen's headerLeft. The default header back only
// renders when the navigation state has a parent route — after a refresh
// the state is rebuilt from the current URL alone, so it vanishes; a custom
// headerLeft keeps the button visible. It uses the native history back when
// this session reached the design from the home page (the home page sets a
// sessionStorage flag that survives refresh): the native back fires
// popstate, which the router handles and restores the home page — the
// imperative router.back() would have no route to pop. Without the flag
// (bare /design, fresh tab, external referrer) go to the home page.
export function HeaderBackButton() {
    const handlePress = () => {
        if (cameFromHome()) {
            window.history.back();
        } else {
            router.replace('/');
        }
    };
    return (
        <TouchableOpacity onPress={handlePress} hitSlop={8} testID="back-button" accessibilityLabel="Back">
            <ChevronLeft size={26} color="#333" />
        </TouchableOpacity>
    );
}
