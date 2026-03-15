import {Stack} from "expo-router";

export default function AppLayout(){
    return(
        <Stack>
            <Stack.Screen name="(tabs)" options={{headerShown : false}}/>
            <Stack.Screen name="chat/[chatId]" options={{title : 'Chat'}}/>
            <Stack.Screen 
            name = "call/[callId]"
            options= {{headerShown : false, presentation : 'fullScreenModal'}}
            />
        </Stack>
    )
}