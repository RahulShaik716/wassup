import {router} from "expo-router";
import {Button,Text, View } from "react-native";

export default function SignIn(){
    return(
        <View style={{flex : 1, alignItems : 'center', justifyContent : 'center',gap : 12}}>
            <Text> SignIn </Text>
            <Button title="sign in" onPress={()=>router.replace('/(app)/(tabs)/chats')}/>
        </View>
    )
}