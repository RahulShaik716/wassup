import { SessionProvider } from "@/src/features/auth/session-context";
import { CallProvider } from "@/src/features/call/call-context";
import { Stack } from "expo-router";

export default function RootLayout() {
  return(
    <SessionProvider>
    <CallProvider>
    <Stack screenOptions={{headerShown: false}}>
      <Stack.Screen name="(auth)"/>
      <Stack.Screen name="(app)"/>
    </Stack>
    </CallProvider>
    </SessionProvider>
  )
}
