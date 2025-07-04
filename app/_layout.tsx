import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { TouchableOpacity, Image, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeProvider } from "@/context/ThemeContext";
import { useTheme } from "@/context/ThemeContext";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db, rtdb } from "@/FirebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { Portal, Provider } from 'react-native-paper';
import LoadingSpinner from "@/components/LoadingSpinner"; // Make sure to create this or use your existing loading spinner component
import { ProfileProvider } from "@/context/ProfileContext"; // Import ProfileProvider
import { ActiveReportContextProvider } from "@/context/ActiveReportContext";
import { ProfilePicContextProvider, useProfilePicContext } from "@/context/ProfilePicContext";


import * as Location from 'expo-location';
import { LOCATION_TASK_NAME } from '@/app/tasks/locationTask';
import { getActiveReportId } from '@/app/utils/reportHelpers';
import { ref, set } from "firebase/database";

import * as TaskManager from 'expo-task-manager';
import { getAuth } from 'firebase/auth';


import { useNavigation } from '@react-navigation/native';
import SideMenu from '@/components/SideMenu';

export default function Layout() {
    const [menuVisible, setMenuVisible] = useState(false);
    const navigation = useNavigation();
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [user, setUser] = useState(null); // Add user state
    const [authLoading, setAuthLoading] = useState(true); // Add authLoading state
    const [profilePicURL, setProfilePicURL] = useProfilePicContext();



    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            console.log("🔥 onAuthStateChanged triggered");
            if (firebaseUser) {
                // @ts-ignore
                setUser(firebaseUser);
                console.log("✅ firebaseUser exists", firebaseUser);

                if (profilePicURL) {
                    setSelectedImage(profilePicURL);
                    console.log("Profile Picture Set on NavBar");
                }
            }
            setAuthLoading(false); // Set authLoading to false after user state is fetched
        });

        return () => unsubscribe();
    }, []);

    const uploadLocationToDatabase = async (
        latitude: number,
        longitude: number,
        reportId: string
    ) => {
        const user = auth.currentUser;
        if (!user) return;

        const locationRef = ref(rtdb, `reports/${reportId}/locations/${user.uid}`);
        await set(locationRef, {
            latitude,
            longitude,
            timestamp: Date.now(),
        });
    };



    useEffect(() => {
        if (!user) return;

        const startLocationUpdates = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                console.warn('❌ Location permission denied');
                return;
            }

            const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
            if (backgroundStatus !== 'granted') {
                console.warn('Background location permission denied');
                return;
            }

            const reportId = await getActiveReportId(user.uid);
            if (!reportId) {
                console.log('ℹ️ No active report found, skipping location updates');
                return;
            }

            const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
            if (!hasStarted) {
                await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                    accuracy: Location.Accuracy.High,
                    timeInterval: 5000,
                    distanceInterval: 0,
                    showsBackgroundLocationIndicator: true,
                    foregroundService: {
                        notificationTitle: 'Sharing location',
                        notificationBody: 'Your location is being shared for an active report.',
                    },
                });
                console.log('✅ Location tracking started');
            } else {
                console.log('📍 Location tracking already running');
            }
        };

        startLocationUpdates();
    }, [user]);


    // If authentication is still loading, show a spinner
    if (authLoading) return <LoadingSpinner />;

    // Top Left Settings button for home.tsx
    const HeaderLeft = () => {
        const { theme } = useTheme();

        return (
            <TouchableOpacity onPress={() => console.log("Settings Pressed")}>
                <Ionicons name="settings-outline" size={24} style={{ marginLeft: 15, color: theme.text }} />
            </TouchableOpacity>
        );
    };

    const HeaderRight = () => {
        const { theme } = useTheme();

        function profileClick() {
            setMenuVisible(!menuVisible);
        }

        return (
            <View className="relative mr-4">
                <TouchableOpacity onPress={() => profileClick()}>
                    <Image
                        source={{
                            uri: selectedImage || "https://upload.wikimedia.org/wikipedia/en/a/a6/Pok%C3%A9mon_Pikachu_art.png",
                        }}
                        className="w-10 h-10 rounded-full"
                    />
                </TouchableOpacity>

                <Portal>
                    {menuVisible && (
                        <View
                            className="absolute top-12 right-0 bg-white rounded-lg p-3 shadow-lg z-50"
                            style={{
                                opacity: menuVisible ? 1 : 0,
                                pointerEvents: menuVisible ? "auto" : "none",
                            }}
                        >
                            <SideMenu isOpen={menuVisible} setIsOpen={setMenuVisible} />
                        </View>
                    )}
                </Portal>
            </View>
        );
    };


    return (
        <Provider>
            <ThemeProvider>
                <ActiveReportContextProvider>
                    <ProfilePicContextProvider>
                        <Stack
                            screenOptions={{
                                headerShown: false,
                                headerTitle: () => <View />,
                                headerTransparent: true,
                                headerRight: () => <HeaderRight />,
                                headerBackTitle: "Back",
                                headerLeft: () => <HeaderLeft />,
                            }}
                        />
                    </ProfilePicContextProvider>
                </ActiveReportContextProvider>
            </ThemeProvider>
        </Provider>
    );
}
