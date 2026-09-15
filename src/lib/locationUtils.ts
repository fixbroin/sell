import { db, collection, getDocs } from './mysqlDb';

/**
 * Calculates the distance between two points on Earth using the Haversine formula.
 * @param lat1 Latitude of the first point.
 * @param lon1 Longitude of the first point.
 * @param lat2 Latitude of the second point.
 * @param lon2 Longitude of the second point.
 * @returns The distance in kilometers.
 */
export function getHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  return distance;
}

export async function calculateNearbyCities(cityId: string, lat: number, lng: number) {
  try {
    const citiesRef = collection(db, "cities");
    const snapshot = await getDocs(citiesRef);
    const cities = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as any))
      .filter(c => c.id !== cityId && c.isActive && c.latitude != null && c.longitude != null);

    const list = cities.map(c => {
      const dist = getHaversineDistance(lat, lng, Number(c.latitude), Number(c.longitude));
      return { id: c.id, name: c.name, slug: c.slug, distance: dist };
    });

    list.sort((a, b) => a.distance - b.distance);
    return list.slice(0, 5).map(c => ({ id: c.id, name: c.name, slug: c.slug }));
  } catch (error) {
    console.error("Error calculating nearby cities:", error);
    return [];
  }
}

export async function calculateNearbyAreas(areaId: string, cityId: string, lat: number, lng: number) {
  try {
    const areasRef = collection(db, "areas");
    const snapshot = await getDocs(areasRef);
    const areas = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as any))
      .filter(a => a.id !== areaId && a.cityId === cityId && a.isActive && a.latitude != null && a.longitude != null);

    const list = areas.map(a => {
      const dist = getHaversineDistance(lat, lng, Number(a.latitude), Number(a.longitude));
      return { id: a.id, name: a.name, slug: a.slug, distance: dist };
    });

    list.sort((a, b) => a.distance - b.distance);
    return list.slice(0, 5).map(a => ({ id: a.id, name: a.name, slug: a.slug }));
  } catch (error) {
    console.error("Error calculating nearby areas:", error);
    return [];
  }
}

export async function recalculateAllNearbyAreasInCity(cityId: string) {
  try {
    const areasRef = collection(db, "areas");
    const snapshot = await getDocs(areasRef);
    const allAreas = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as any))
      .filter(a => a.cityId === cityId && a.isActive && a.latitude != null && a.longitude != null);

    for (const area of allAreas) {
      const list = allAreas
        .filter(a => a.id !== area.id)
        .map(a => {
          const dist = getHaversineDistance(Number(area.latitude), Number(area.longitude), Number(a.latitude), Number(a.longitude));
          return { id: a.id, name: a.name, slug: a.slug, distance: dist };
        });

      list.sort((a, b) => a.distance - b.distance);
      const closest = list.slice(0, 5).map(a => ({ id: a.id, name: a.name, slug: a.slug }));

      const { doc, updateDoc } = require('./mysqlDb');
      await updateDoc(doc(db, "areas", area.id), { nearbyAreas: closest });
    }
  } catch (error) {
    console.error("Error recalculating nearby areas:", error);
  }
}
