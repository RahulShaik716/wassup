import { router, useLocalSearchParams } from "expo-router"
import {View, Text, Button} from "react-native";
export default function Call(){
    const {callId} = useLocalSearchParams<{callId : string}>()
    return (
        <View style={{flex : 1, alignItems : 'center', justifyContent : 'center', gap : 12}}>
            <Text> Call ID: {callId} </Text>
            <Button title="End Call" onPress={()=>router.back()}/>
        </View>
    )
}