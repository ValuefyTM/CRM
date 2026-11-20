-- Comparabile (anunțuri de piață): punctele care nu pot fi în România (în ocean, 0/0, coordonate inversate) încurcă harta.
-- Cele cu latitudinea și longitudinea inversate se întorc; restul rămân fără punct (anunțul se așază în centrul zonei lui).
UPDATE market_listings SET lat = lng, lng = lat
  WHERE lat IS NOT NULL AND lng IS NOT NULL AND lat BETWEEN 20.2 AND 29.8 AND lng BETWEEN 43.5 AND 48.4;
UPDATE market_listings SET lat = NULL, lng = NULL, geo_precision = NULL
  WHERE (lat IS NOT NULL OR lng IS NOT NULL) AND NOT (COALESCE(lat, 0) BETWEEN 43.5 AND 48.4 AND COALESCE(lng, 0) BETWEEN 20.2 AND 29.8);
