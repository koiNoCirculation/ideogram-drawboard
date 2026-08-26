import { Stack } from "expo-router";
import { I18nProvider } from "../i18n";

export default function RootLayout() {
  return (
    <I18nProvider>
      <Stack />
    </I18nProvider>
  );
}
