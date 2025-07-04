import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { PROVIDER_DEFAULT, Region, Polyline } from 'react-native-maps';
import { onSnapshot, collection, query, where } from 'firebase/firestore';
import { auth, db, rtdb } from '@/FirebaseConfig'; // Ensure realtimeDb is exported from FirebaseConfig
import * as Location from 'expo-location';
import { onAuthStateChanged } from 'firebase/auth';
// @ts-ignore
import polyline from '@mapbox/polyline';
import CarMarker from './CarMarker';
import { ref, onValue } from 'firebase/database';

const Map = () => {
    const [userId, setUserId] = useState<string | null>(null);
    const [region, setRegion] = useState<Region | null>(null);
    const [carPosition, setCarPosition] = useState<{ latitude: number; longitude: number } | null>(null);
    const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
    const [reportId, setReportId] = useState<string | null>(null);

    const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            if (firebaseUser) {
                setUserId(firebaseUser.uid);
            }
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const getCurrentLocation = async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                console.log('Permission to access location was denied');
                return;
            }

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
            });

            const { latitude, longitude } = location.coords;

            setRegion({
                latitude,
                longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            });
        };

        getCurrentLocation();
    }, []);

    // Listen for active report from Firestore
    useEffect(() => {
        if (!userId) return;

        const q = query(
            collection(db, 'reports'),
            where('userId', '==', userId),
            where('status', '==', 'Active')
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const hasReport = !querySnapshot.empty;

            if (hasReport) {
                const reportDoc = querySnapshot.docs[0];
                const id = reportDoc.id;
                console.log(id);
                setReportId(id);

                // Listen for operator location from Realtime DB
                const operatorRef = ref(rtdb, `reports/${id}/operatorGeolocation`);
                onValue(operatorRef, async (snapshot) => {
                    const data = snapshot.val();
                    console.log(data);
                    if (data?.latitude && data?.longitude) {
                        const operatorCoords = {
                            latitude: data.latitude,
                            longitude: data.longitude,
                        };

                        const location = await Location.getCurrentPositionAsync({
                            accuracy: Location.Accuracy.High,
                        });

                        const userCoords = {
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude,
                        };

                        setCarPosition(operatorCoords); // Set operator position for marker
                        await getRoute(userCoords, operatorCoords); // Draw route
                    }
                });
            }
        }, (error) => {
            console.error('Error listening for active report:', error);
        });

        return () => unsubscribe();
    }, [userId]);

    const getRoute = async (
        start: { latitude: number; longitude: number },
        end: { latitude: number; longitude: number }
    ) => {
        try {
            const origin = `${start.latitude},${start.longitude}`;
            const destination = `${end.latitude},${end.longitude}`;

            const response = await fetch(
                `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${GOOGLE_API_KEY}`
            );
            const data = await response.json();

            if (data.routes.length) {
                const points = polyline.decode(data.routes[0].overview_polyline.points);
                const routePath = points.map(([lat, lng]: [number, number]) => ({
                    latitude: lat,
                    longitude: lng,
                }));
                setRouteCoords(routePath);
            } else {
                console.warn('No route found');
            }
        } catch (error) {
            console.error('Error fetching route:', error);
        }
    };

    if (!region) {
        return null; // or a loading spinner
    }

    return (
        <MapView
            provider={PROVIDER_DEFAULT}
            style={styles.map}
            initialRegion={region}
            showsUserLocation
        >
            {carPosition && (
                <CarMarker
                    latitude={carPosition.latitude}
                    longitude={carPosition.longitude}
                />
            )}
            <Polyline
                coordinates={routeCoords}
                strokeColor="red"
                strokeWidth={4}
            />
        </MapView>
    );
};

const styles = StyleSheet.create({
    map: {
        width: '100%',
        height: '80%',
        borderRadius: 16,
        overflow: 'hidden',
    },
});

export default Map;
